/**
 * EventsPage - Browse all available events
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { getEvents } from '@/services/events';
import { EventTicket } from '@/components/EventTicket';
import type { Event } from '@/types';
import styles from './EventsPage.module.css';

export function EventsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: getEvents,
  });

  const term = searchTerm.trim().toLowerCase();
  const filteredEvents = [...(events ?? [])]
    .filter((event: Event) =>
      event.title.toLowerCase().includes(term) ||
      (event.description ?? '').toLowerCase().includes(term) ||
      (event.venue?.name ?? '').toLowerCase().includes(term)
    )
    .sort((a: Event, b: Event) => a.event_date.localeCompare(b.event_date));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {events ? `${events.length} ${events.length === 1 ? 'event' : 'events'} on sale` : 'On sale'}
          </p>
          <h1 className={styles.title}>All events</h1>
        </div>

        <label className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden="true" />
          <span className="sr-only">Search events</span>
          <input
            type="search"
            placeholder="Search by name or venue"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </label>
      </header>

      {isLoading && <p className={styles.status}>Loading events…</p>}

      {error && (
        <div className={styles.empty}>
          <h2>Couldn’t load events</h2>
          <p>{error instanceof Error ? error.message : 'Something went wrong'}</p>
        </div>
      )}

      {!isLoading && !error && (filteredEvents.length > 0 ? (
        <div className={styles.grid}>
          {filteredEvents.map((event: Event) => (
            <EventTicket key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>No events found</h2>
          <p>{term ? 'Try a different search.' : 'Check back soon for new events.'}</p>
        </div>
      ))}
    </div>
  );
}
