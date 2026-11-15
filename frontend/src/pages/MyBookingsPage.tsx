/**
 * MyBookingsPage - View user's bookings
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyBookings, cancelBooking, purchaseBooking } from '@/services/bookings';
import { useAuth } from '@/context/AuthContext';
import { Button, Ticket } from '@/components/ui';
import type { Booking, BookingStatusType } from '@/types';
import styles from './MyBookingsPage.module.css';

export function MyBookingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['myBookings'],
    queryFn: getMyBookings,
    enabled: isAuthenticated,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myBookings'] });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: (bookingId: string) => 
      purchaseBooking({ booking_id: bookingId, payment_method: 'card' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myBookings'] });
    },
  });

  // Ticks so the "min left to pay" countdown stays current
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h1>Your tickets live here</h1>
          <p>Log in to see your bookings.</p>
          <Button onClick={() => navigate('/login', { state: { from: '/my-bookings' } })}>
            Log in
          </Button>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  const formatTime = (dateString: string): string =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const STATUS: Record<string, { class: string; label: string }> = {
    reserved: { class: styles.statusPending, label: 'Held' },
    purchased: { class: styles.statusConfirmed, label: 'Confirmed' },
    cancelled: { class: styles.statusCancelled, label: 'Cancelled' },
    expired: { class: styles.statusExpired, label: 'Expired' },
  };

  const getStatusBadge = (status: BookingStatusType) => {
    const config = STATUS[status] || { class: '', label: status || 'Unknown' };
    return <span className={`${styles.statusBadge} ${config.class}`}>{config.label}</span>;
  };

  const getRemainingTime = (expiresAt: string): string | null => {
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return null;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} min left to pay`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m left to pay`;
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.status}>Loading your bookings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <h1>Couldn’t load bookings</h1>
          <p>{error instanceof Error ? error.message : 'Something went wrong'}</p>
        </div>
      </div>
    );
  }

  const active = (bookings ?? []).filter((b: Booking) => b.status === 'reserved' || b.status === 'purchased');
  const past = (bookings ?? []).filter((b: Booking) => b.status !== 'reserved' && b.status !== 'purchased');

  const renderBooking = (booking: Booking) => {
    const isPast = booking.status === 'cancelled' || booking.status === 'expired';
    const purchasing = purchaseMutation.isPending && purchaseMutation.variables === booking.id;
    const cancelling = cancelMutation.isPending && cancelMutation.variables === booking.id;
    const failed =
      (purchaseMutation.isError && purchaseMutation.variables === booking.id && purchaseMutation.error) ||
      (cancelMutation.isError && cancelMutation.variables === booking.id && cancelMutation.error);

    return (
      <Ticket
        key={booking.id}
        date={booking.event_date || booking.reserved_at}
        muted={isPast}
        aside={
          <>
            {getStatusBadge(booking.status)}
            <span className={styles.price}>{formatPrice(booking.total_amount)}</span>
          </>
        }
      >
        <h3 className={styles.eventTitle}>{booking.event_title || 'Event'}</h3>
        <p className={styles.meta}>
          {booking.event_date && <span>{formatTime(booking.event_date)}</span>}
          {booking.venue_name && <span>{booking.venue_name}</span>}
        </p>
        {booking.seat_number && (
          <p className={styles.seat}>
            <span className={styles.seatLabel}>Seat</span> {booking.seat_number}
          </p>
        )}

        {booking.status === 'reserved' && (
          <div className={styles.pending}>
            <p className={styles.expiry}>{getRemainingTime(booking.expires_at) || 'Hold ending now'}</p>
            <div className={styles.actionButtons}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => purchaseMutation.mutate(booking.id)}
                isLoading={purchasing}
                disabled={cancelling}
              >
                Pay {formatPrice(booking.total_amount)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancelMutation.mutate(booking.id)}
                isLoading={cancelling}
                disabled={purchasing}
              >
                Release seat
              </Button>
            </div>
          </div>
        )}

        {booking.status === 'purchased' && (
          <Link to={`/events/${booking.event_id}`} className={styles.viewEvent}>
            View event →
          </Link>
        )}

        {failed && (
          <p className={styles.actionError} role="alert">
            {failed instanceof Error ? failed.message : 'Something went wrong. Please try again.'}
          </p>
        )}
      </Ticket>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {active.length} active · {past.length} past
        </p>
        <h1 className={styles.title}>My tickets</h1>
      </header>

      {bookings && bookings.length > 0 ? (
        <>
          {active.length > 0 && <div className={styles.bookingsList}>{active.map(renderBooking)}</div>}

          {past.length > 0 && (
            <section className={styles.pastSection}>
              <h2 className={styles.pastTitle}>Past</h2>
              <div className={styles.bookingsList}>{past.map(renderBooking)}</div>
            </section>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <h2>No tickets yet</h2>
          <p>When you reserve a seat, it shows up here.</p>
          <Link to="/events">
            <Button>Browse events</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
