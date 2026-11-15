/**
 * EventTicket - an event in a list, drawn as a ticket stub that links to its seat map.
 */

import { Link } from 'react-router-dom';
import { Ticket } from '@/components/ui';
import type { Event } from '@/types';
import styles from './EventTicket.module.css';

const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function EventTicket({ event }: { event: Event }) {
  const time = new Date(event.event_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const soldOut = event.available_seats <= 0;
  const low = !soldOut && event.available_seats <= 5;

  return (
    <Link to={`/events/${event.id}`} className={styles.link}>
      <Ticket
        date={event.event_date}
        muted={soldOut}
        aside={
          <>
            <span className={styles.price}>{price.format(event.ticket_price)}</span>
            <span className={styles.cta} aria-hidden="true">Seats →</span>
          </>
        }
      >
        <h3 className={styles.title}>{event.title}</h3>
        <p className={styles.meta}>
          <span>{time}</span>
          {event.venue && <span>{event.venue.name}</span>}
        </p>
        <p className={`${styles.seats} ${low ? styles.seatsLow : ''}`}>
          {soldOut ? 'Sold out' : low ? `Only ${event.available_seats} left` : `${event.available_seats} seats left`}
        </p>
      </Ticket>
    </Link>
  );
}
