/**
 * EventDetailPage - View event details and select seats
 */

import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvent, getEventSeats } from '@/services/events';
import { reserveSeat, waitForJobCompletion } from '@/services/bookings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';
import type { Seat, SeatStatusType } from '@/types';
import styles from './EventDetailPage.module.css';

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [reservationError, setReservationError] = useState('');

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id!),
    enabled: !!id,
  });

  const { data: seatsData, isLoading: seatsLoading } = useQuery({
    queryKey: ['seats', id],
    queryFn: () => getEventSeats(id!),
    enabled: !!id,
    refetchInterval: 10000, // Refresh seats every 10 seconds
  });

  const reserveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSeat || !id) throw new Error('No seat selected');
      
      const response = await reserveSeat({
        event_id: id,
        seat_number: selectedSeat.seat_number,
      });
      
      // Without a queue the backend books synchronously and returns the booking
      if (!('job_id' in response)) return;

      const jobResult = await waitForJobCompletion(response.job_id);

      if (jobResult.status === 'failed') {
        throw new Error(jobResult.error || 'Reservation failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seats', id] });
      navigate(`/my-bookings`);
    },
    onError: (error) => {
      // The seat may have just been taken; show the current map
      queryClient.invalidateQueries({ queryKey: ['seats', id] });
      setReservationError(error instanceof Error ? error.message : 'Reservation failed');
    },
  });

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getSeatColor = (status: SeatStatusType): string => {
    switch (status) {
      case 'available':
        return styles.seatAvailable;
      case 'reserved':
        return styles.seatReserved;
      case 'sold':
        return styles.seatSold;
      default:
        return '';
    }
  };

  const handleSeatClick = (seat: Seat) => {
    if (seat.status !== 'available') return;
    setSelectedSeat(seat.id === selectedSeat?.id ? null : seat);
    setReservationError('');
  };

  const handleReserve = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/events/${id}` } });
      return;
    }
    reserveMutation.mutate();
  };

  if (eventLoading || seatsLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.status}>Loading event…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <h1>Event not found</h1>
          <p>This event doesn’t exist or is no longer on sale.</p>
          <Button onClick={() => navigate('/events')}>Browse events</Button>
        </div>
      </div>
    );
  }

  const seats = seatsData?.seats || [];
  const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  // Seats are named like "R1-S3"; fall back to that prefix when row_number is empty
  const rowOf = (seat: Seat) => seat.row_number || seat.seat_number.split('-')[0];
  const labelOf = (seat: Seat) => {
    const row = rowOf(seat);
    return seat.seat_number.startsWith(`${row}-`)
      ? seat.seat_number.slice(row.length + 1).replace(/^S/i, '')
      : seat.seat_number;
  };

  const sections: Record<string, Record<string, Seat[]>> = {};
  for (const seat of seats) {
    const section = seat.section || 'General';
    const row = rowOf(seat);
    ((sections[section] ??= {})[row] ??= []).push(seat);
  }

  const date = new Date(event.event_date);
  const dateText = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeText = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={styles.container}>
      <Link to="/events" className={styles.back}>← All events</Link>

      <header className={styles.eventHeader}>
        <p className={styles.eyebrow}>{dateText} · {timeText}</p>
        <h1 className={styles.eventTitle}>{event.title}</h1>
        {event.description && <p className={styles.eventDescription}>{event.description}</p>}

        <dl className={styles.facts}>
          {event.venue && (
            <div>
              <dt>Venue</dt>
              <dd>{event.venue.name}, {event.venue.city}</dd>
            </div>
          )}
          <div>
            <dt>Seats left</dt>
            <dd>{event.available_seats} of {event.total_seats}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{formatPrice(event.ticket_price)}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.content}>
        <section className={styles.seatSelection} aria-labelledby="seat-heading">
          <div className={styles.seatHead}>
            <h2 id="seat-heading" className={styles.sectionTitle}>Choose a seat</h2>
            <ul className={styles.legend}>
              <li><span className={`${styles.legendSwatch} ${styles.seatAvailable}`} />Available</li>
              <li><span className={`${styles.legendSwatch} ${styles.seatSelected}`} />Selected</li>
              <li><span className={`${styles.legendSwatch} ${styles.seatReserved}`} />Held</li>
              <li><span className={`${styles.legendSwatch} ${styles.seatSold}`} />Sold</li>
            </ul>
          </div>

          <div className={styles.map}>
            <div className={styles.stage}><span>Stage</span></div>

            {Object.entries(sections).map(([section, rows]) => (
              <div key={section} className={styles.seatSection}>
                <h3 className={styles.sectionName}>{section}</h3>
                {Object.keys(rows).sort(byNumber).map((row) => (
                  <div key={row} className={styles.seatRow}>
                    <span className={styles.rowLabel}>{row}</span>
                    <div className={styles.seatGrid}>
                      {rows[row]
                        .sort((a, b) => byNumber(a.seat_number, b.seat_number))
                        .map((seat) => {
                          const selected = selectedSeat?.id === seat.id;
                          return (
                            <button
                              key={seat.id}
                              type="button"
                              className={`${styles.seat} ${getSeatColor(seat.status)} ${selected ? styles.seatSelected : ''}`}
                              onClick={() => handleSeatClick(seat)}
                              disabled={seat.status !== 'available'}
                              aria-pressed={selected}
                              aria-label={`Seat ${seat.seat_number}, ${seat.status}`}
                              title={`Seat ${seat.seat_number}`}
                            >
                              {labelOf(seat)}
                            </button>
                          );
                        })}
                    </div>
                    <span className={styles.rowLabel}>{row}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.summary}>
            <div className={styles.summaryMain}>
              <p className={styles.summaryLabel}>Your ticket</p>
              <h2 className={styles.summaryTitle}>{event.title}</h2>
              <dl className={styles.summaryList}>
                <div className={styles.summaryItem}>
                  <dt>Date</dt>
                  <dd>{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</dd>
                </div>
                <div className={styles.summaryItem}>
                  <dt>Time</dt>
                  <dd>{timeText}</dd>
                </div>
                <div className={styles.summaryItem}>
                  <dt>Seat</dt>
                  <dd className={selectedSeat ? styles.summarySeat : styles.summaryEmpty}>
                    {selectedSeat ? selectedSeat.seat_number : 'Not chosen'}
                  </dd>
                </div>
                {selectedSeat && (
                  <div className={styles.summaryItem}>
                    <dt>Section</dt>
                    <dd>{selectedSeat.section || 'General'}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className={styles.summaryStub}>
              <div className={styles.totalRow}>
                <span>Total</span>
                <span className={styles.totalPrice}>
                  {formatPrice(selectedSeat ? event.ticket_price : 0)}
                </span>
              </div>

              {reservationError && (
                <p className={styles.reservationError} role="alert">{reservationError}</p>
              )}

              <Button
                variant="secondary"
                size="lg"
                className={styles.reserveButton}
                onClick={handleReserve}
                disabled={(isAuthenticated && !selectedSeat) || reserveMutation.isPending}
                isLoading={reserveMutation.isPending}
              >
                {!isAuthenticated
                  ? 'Log in to reserve'
                  : selectedSeat
                    ? 'Reserve this seat'
                    : 'Choose a seat first'}
              </Button>
              <p className={styles.holdNote}>Held for you for 10 minutes once reserved.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
