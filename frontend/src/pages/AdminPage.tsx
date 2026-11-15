/**
 * AdminPage - Create venues and events (admins only)
 *
 * The route is wrapped in <ProtectedRoute requireAdmin>, but the real check is
 * on the server: POST /venues and POST /events return 403 for non-admins.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createEvent, createVenue, getVenues } from '@/services/events';
import { Button, Input, Card } from '@/components/ui';
import type { Event } from '@/types';
import inputStyles from '@/components/ui/Input.module.css';
import styles from './AdminPage.module.css';

// shortcut: caps seats per event to keep the free-tier database small; raise it on a paid plan.
const MAX_SEATS = 500;

export function AdminPage() {
  const queryClient = useQueryClient();
  const [venueId, setVenueId] = useState('');
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null);

  const { data: venues = [] } = useQuery({ queryKey: ['venues'], queryFn: getVenues });
  const selectedVenueId = venueId || venues[0]?.id || '';
  const selectedVenue = venues.find(v => v.id === selectedVenueId);

  const venueMutation = useMutation({
    mutationFn: createVenue,
    onSuccess: (venue) => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      setVenueId(venue.id);
    },
  });

  const eventMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setCreatedEvent(event);
    },
  });

  const handleVenueSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    venueMutation.mutate(
      {
        name: String(data.get('name')).trim(),
        address: String(data.get('address')).trim(),
        capacity: Number(data.get('capacity')),
      },
      { onSuccess: () => form.reset() }
    );
  };

  const handleEventSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setCreatedEvent(null);
    eventMutation.mutate(
      {
        venue_id: selectedVenueId,
        title: String(data.get('title')).trim(),
        description: String(data.get('description')).trim(),
        // datetime-local is in the admin's local time; send it as UTC
        event_date: new Date(String(data.get('event_date'))).toISOString(),
        ticket_price: Number(data.get('ticket_price')),
        total_seats: Number(data.get('total_seats')),
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Admin · box office back room</p>
        <h1 className={styles.title}>Put on a show</h1>
      </header>

      <div className={styles.grid}>
        <Card className={styles.card}>
          <Card.Header>
            <Card.Title>1. Venue</Card.Title>
            <Card.Description>Where the event happens. Create it once, reuse it for many events.</Card.Description>
          </Card.Header>
          <Card.Content>
            <form onSubmit={handleVenueSubmit} className={styles.form}>
              {venueMutation.error && <div className={styles.error}>{venueMutation.error.message}</div>}
              <Input label="Name" name="name" placeholder="The Blue Note" required />
              <Input label="Address" name="address" placeholder="131 W 3rd St, New York" required />
              <Input label="Capacity" name="capacity" type="number" min={1} placeholder="300" required />
              <Button type="submit" variant="outline" isLoading={venueMutation.isPending}>
                Create venue
              </Button>
            </form>
          </Card.Content>
        </Card>

        <Card className={styles.card}>
          <Card.Header>
            <Card.Title>2. Event</Card.Title>
            <Card.Description>Seats are created automatically and go on sale right away.</Card.Description>
          </Card.Header>
          <Card.Content>
            <form onSubmit={handleEventSubmit} className={styles.form}>
              {eventMutation.error && <div className={styles.error}>{eventMutation.error.message}</div>}
              {createdEvent && (
                <div className={styles.success} role="status">
                  “{createdEvent.title}” is on sale.{' '}
                  <Link to={`/events/${createdEvent.id}`} className={styles.link}>View seat map →</Link>
                </div>
              )}

              <div className={inputStyles.inputWrapper}>
                <label htmlFor="venue" className={inputStyles.label}>Venue</label>
                <select
                  id="venue"
                  className={inputStyles.input}
                  value={selectedVenueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  required
                >
                  {venues.length === 0 && <option value="">Create a venue first</option>}
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.capacity} seats)</option>
                  ))}
                </select>
              </div>

              <Input label="Title" name="title" placeholder="Midnight Jazz Session" required />
              <Input label="Description" name="description" placeholder="Optional" />
              <Input label="Date and time" name="event_date" type="datetime-local" required />
              <div className={styles.row}>
                <Input label="Ticket price ($)" name="ticket_price" type="number" min={0} step="0.01" placeholder="49.99" required />
                <Input
                  label="Seats"
                  name="total_seats"
                  type="number"
                  min={1}
                  max={Math.min(MAX_SEATS, selectedVenue?.capacity ?? MAX_SEATS)}
                  placeholder="100"
                  helperText={`Up to ${Math.min(MAX_SEATS, selectedVenue?.capacity ?? MAX_SEATS)}`}
                  required
                />
              </div>
              <Button type="submit" variant="primary" isLoading={eventMutation.isPending} disabled={!selectedVenueId}>
                Put on sale
              </Button>
            </form>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
