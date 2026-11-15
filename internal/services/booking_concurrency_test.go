package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"event-ticketing-system/internal/config"
	"event-ticketing-system/internal/database"
	"event-ticketing-system/internal/models"
	"event-ticketing-system/internal/repository"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

type recordingPublisher struct {
	mu     sync.Mutex
	events []string
}

func (p *recordingPublisher) PublishBookingEvent(_ context.Context, eventType string, _ *models.Booking, _ map[string]interface{}) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, eventType)
	return nil
}

// TestReserveSeatConcurrentBuyers races many buyers for the same seat against a real
// PostgreSQL database: exactly one must win, every other buyer must get a clean
// "seat taken" error, and the losers' rolled-back transactions must not corrupt counts.
//
// It creates its own users, venue, event and seats, and deletes them afterwards.
// Run: TEST_DATABASE_URL=postgres://... go test ./internal/services -run Concurrent -v
func TestReserveSeatConcurrentBuyers(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	cfg := &config.Config{
		Database: config.DatabaseConfig{URL: dsn},
		Booking:  config.BookingConfig{ReservationTimeoutMinutes: 10},
	}
	if err := database.Connect(cfg); err != nil {
		t.Fatalf("connect: %v", err)
	}

	const buyers = 50
	buyerIDs, eventID := seedRaceEvent(t, database.DB, buyers)

	svc := NewBookingService(
		repository.NewBookingRepository(), repository.NewEventRepository(), repository.NewSeatRepository(),
		cfg, nil, nil,
	)
	pub := &recordingPublisher{}
	svc.SetEventPublisher(pub)

	start := make(chan struct{})
	results := make(chan error, buyers)
	var wg sync.WaitGroup
	for _, buyerID := range buyerIDs {
		wg.Add(1)
		go func(buyerID uuid.UUID) {
			defer wg.Done()
			<-start // release every buyer at the same instant
			_, err := svc.ReserveSeat(context.Background(), buyerID, &models.ReserveSeatRequest{EventID: eventID, SeatNumber: "R1-S1"})
			results <- err
		}(buyerID)
	}
	close(start)
	wg.Wait()
	close(results)

	wins, taken := 0, 0
	for err := range results {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, ErrSeatBeingBooked), errors.Is(err, ErrSeatNotAvailable), errors.Is(err, ErrNoAvailableSeats):
			taken++
		default:
			t.Errorf("unexpected error: %v", err)
		}
	}
	if wins != 1 || taken != buyers-1 {
		t.Fatalf("want 1 winner and %d rejected, got %d winners and %d rejected", buyers-1, wins, taken)
	}

	// The database must agree: one active booking, R1-S1 held, R1-S2 untouched,
	// and available_seats decremented exactly once despite 49 rolled-back attempts.
	var activeBookings, availableSeats int
	var s1, s2 string
	mustScan(t, database.DB.QueryRow(`SELECT count(*) FROM bookings WHERE event_id = $1 AND status IN ('reserved', 'purchased')`, eventID), &activeBookings)
	mustScan(t, database.DB.QueryRow(`SELECT available_seats FROM events WHERE id = $1`, eventID), &availableSeats)
	mustScan(t, database.DB.QueryRow(`SELECT status FROM seats WHERE event_id = $1 AND seat_number = 'R1-S1'`, eventID), &s1)
	mustScan(t, database.DB.QueryRow(`SELECT status FROM seats WHERE event_id = $1 AND seat_number = 'R1-S2'`, eventID), &s2)
	if activeBookings != 1 || availableSeats != 1 || s1 != "reserved" || s2 != "available" {
		t.Fatalf("db state: active_bookings=%d (want 1) available_seats=%d (want 1) R1-S1=%s (want reserved) R1-S2=%s (want available)",
			activeBookings, availableSeats, s1, s2)
	}

	// Live seat maps get exactly one update: the winner's reservation.
	if len(pub.events) != 1 || pub.events[0] != "booking.reserved" {
		t.Fatalf("published events = %v, want [booking.reserved]", pub.events)
	}
}

// seedRaceEvent creates buyers and a 2-seat event; cleanup deletes all of it
// (deleting the venue cascades to its events, seats and bookings).
func seedRaceEvent(t *testing.T, db *sql.DB, buyers int) ([]uuid.UUID, uuid.UUID) {
	t.Helper()
	runID := uuid.NewString()[:8]
	emailPattern := fmt.Sprintf("race-test-%s-%%@example.com", runID)

	buyerIDs := make([]uuid.UUID, buyers)
	for i := range buyerIDs {
		buyerIDs[i] = uuid.New()
		if _, err := db.Exec(`INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, 'not-a-real-hash', 'Race Test Buyer')`,
			buyerIDs[i], fmt.Sprintf("race-test-%s-%d@example.com", runID, i)); err != nil {
			t.Fatalf("seed user: %v", err)
		}
	}

	venueID, eventID := uuid.New(), uuid.New()
	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM venues WHERE id = $1`, venueID); err != nil {
			t.Errorf("cleanup venue: %v", err)
		}
		if _, err := db.Exec(`DELETE FROM users WHERE email LIKE $1`, emailPattern); err != nil {
			t.Errorf("cleanup users: %v", err)
		}
	})

	steps := []struct {
		query string
		args  []interface{}
	}{
		{`INSERT INTO venues (id, name, address, capacity) VALUES ($1, 'Race Test Venue', 'Test', 2)`, []interface{}{venueID}},
		{`INSERT INTO events (id, venue_id, title, event_date, ticket_price, total_seats, available_seats, created_by)
		  VALUES ($1, $2, 'Race Test Event', $3, 10, 2, 2, $4)`, []interface{}{eventID, venueID, time.Now().Add(30 * 24 * time.Hour), buyerIDs[0]}},
		{`INSERT INTO seats (event_id, seat_number, row_number, section) VALUES ($1, 'R1-S1', 'R1', 'GENERAL'), ($1, 'R1-S2', 'R1', 'GENERAL')`, []interface{}{eventID}},
	}
	for _, s := range steps {
		if _, err := db.Exec(s.query, s.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	return buyerIDs, eventID
}

func mustScan(t *testing.T, row *sql.Row, dest interface{}) {
	t.Helper()
	if err := row.Scan(dest); err != nil {
		t.Fatalf("scan: %v", err)
	}
}
