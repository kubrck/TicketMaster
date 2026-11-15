/**
 * Layout Component - Page wrapper
 * 
 * Uses CSS Modules for styling.
 */

import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.layout}>
      {/* Header */}
      <Header />
      
      {/* Main content area */}
      <main className={styles.main}>
        <Outlet />
      </main>
      
      <footer className={styles.footer}>
        <div className={styles.footerContainer}>
          <span className={styles.footerMark}>TicketMaster</span>
          <p className={styles.footerNote}>
            Seats are held for 10 minutes while you check out. One seat, one buyer.
          </p>
        </div>
      </footer>
    </div>
  );
}
