/**
 * Home Page - poster hero with the next event, how holds work, and upcoming events.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '@/services/events';
import { EventTicket } from '@/components/EventTicket';
import type { Event } from '@/types';
import styles from './HomePage.module.css';

const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const STEPS = [
  { n: '01', title: 'Pick a seat', text: 'Choose it on the live seat map. You see what is free right now.' },
  { n: '02', title: 'It’s held for you', text: 'Your seat is yours for 10 minutes while you check out.' },
  { n: '03', title: 'One seat, one buyer', text: 'If two people click the same seat, exactly one gets it.' },
];

export function HomePage() {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: getEvents,
  });

  const upcoming = [...(events ?? [])]
    .filter((e: Event) => new Date(e.event_date) >= new Date())
    .sort((a: Event, b: Event) => a.event_date.localeCompare(b.event_date));
  const next = upcoming[0];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Box office · Live seat maps</p>
          <h1 className={styles.heroTitle}>
            Good seats<br />
            go <span className={styles.heroAccent}>fast.</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Pick your exact seat, and it’s held for you while you pay. Nobody else can take it.
          </p>
          <div className={styles.heroButtons}>
            <Link to="/events" className={styles.buttonPrimary}>Browse events</Link>
            <Link to="/register" className={styles.buttonText}>Create an account →</Link>
          </div>
        </div>

        {next && (
          <Link to={`/events/${next.id}`} className={styles.nextTicket} aria-label={`Next up: ${next.title}`}>
            <div className={styles.nextMain}>
              <p className={styles.nextLabel}>Next up</p>
              <h2 className={styles.nextTitle}>{next.title}</h2>
              <dl className={styles.nextDetails}>
                <div>
                  <dt>Date</dt>
                  <dd>{new Date(next.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{new Date(next.event_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</dd>
                </div>
                <div>
                  <dt>Seats left</dt>
                  <dd>{next.available_seats}</dd>
                </div>
              </dl>
            </div>
            <div className={styles.nextStub}>
              <span className={styles.nextPrice}>{price.format(next.ticket_price)}</span>
              <span className={styles.nextCta}>Pick a seat →</span>
            </div>
          </Link>
        )}
      </section>

      <section className={styles.steps} aria-label="How booking works">
        {STEPS.map((s) => (
          <div key={s.n} className={styles.step}>
            <span className={styles.stepNumber}>{s.n}</span>
            <div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepText}>{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.events}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>On sale now</h2>
          <Link to="/events" className={styles.viewAll}>All events →</Link>
        </div>

        {isLoading && <p className={styles.status}>Loading events…</p>}
        {error && <p className={styles.status}>Couldn’t load events. Please try again in a moment.</p>}

        {upcoming.length > 0 ? (
          <div className={styles.eventsGrid}>
            {upcoming.slice(0, 4).map((event: Event) => (
              <EventTicket key={event.id} event={event} />
            ))}
          </div>
        ) : (
          !isLoading && !error && <p className={styles.status}>No events on sale right now. Check back soon.</p>
        )}
      </section>
    </div>
  );
}
