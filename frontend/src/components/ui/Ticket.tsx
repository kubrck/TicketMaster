/**
 * Ticket - a ticket-stub layout: date stub | perforation | body | optional aside.
 */

import type { ReactNode } from 'react';
import styles from './Ticket.module.css';

interface TicketProps {
  date: string;
  children: ReactNode;
  aside?: ReactNode;
  muted?: boolean;
  className?: string;
}

export function Ticket({ date, children, aside, muted = false, className = '' }: TicketProps) {
  const d = new Date(date);
  return (
    <article className={`${styles.ticket} ${muted ? styles.muted : ''} ${className}`}>
      <div className={styles.stub}>
        <time dateTime={date} className={styles.stubDate}>
          <span className={styles.month}>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
          <span className={styles.day}>{d.getDate()}</span>
          <span className={styles.weekday}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
        </time>
      </div>
      <div className={styles.body}>{children}</div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </article>
  );
}
