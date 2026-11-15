package services

import (
	"context"
	"fmt"

	"event-ticketing-system/internal/models"
	"event-ticketing-system/internal/websocket"
)

// HubEventPublisher broadcasts booking events straight to WebSocket clients.
// It replaces the Kafka publisher when Kafka is off, so seat maps stay live
// either way (with Kafka, BookingEventConsumer does this broadcast instead).
type HubEventPublisher struct {
	hub *websocket.Hub
}

func NewHubEventPublisher(hub *websocket.Hub) *HubEventPublisher {
	return &HubEventPublisher{hub: hub}
}

func (p *HubEventPublisher) PublishBookingEvent(_ context.Context, eventType string, booking *models.Booking, _ map[string]interface{}) error {
	status, ok := seatStatusForBookingEvent(eventType)
	if !ok {
		return fmt.Errorf("unsupported booking event type %q", eventType)
	}
	p.hub.BroadcastSeatUpdate(booking.EventID, booking.SeatID, status)
	return nil
}
