/**
 * Header Component - Main navigation bar
 */

import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';
import { ThemeToggle } from './ThemeToggle';
import styles from './Header.module.css';

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(prev => !prev);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  const handleMobileLogout = useCallback(() => {
    handleLogout();
    closeMobileMenu();
  }, [handleLogout, closeMobileMenu]);

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoIcon} aria-hidden="true" />
            <span className={styles.logoText}>TicketMaster</span>
          </Link>

          <nav className={styles.desktopNav}>
            <NavLink to="/events" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}>
              Events
            </NavLink>
            
            {isAuthenticated ? (
              <>
                <NavLink to="/my-bookings" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}>
                  My tickets
                </NavLink>
                
                <div className={styles.userSection}>
                  <span className={styles.userName}>{user?.full_name}</span>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleLogout}
                    leftIcon={<LogOut />}
                  >
                    Log out
                  </Button>
                </div>
              </>
            ) : (
              <div className={styles.authButtons}>
                <NavLink to="/login" className={styles.navLink}>
                  Log in
                </NavLink>
                <Link to="/register">
                  <Button variant="primary" size="sm">Sign up</Button>
                </Link>
              </div>
            )}
          </nav>

          <div className={styles.headerTools}>
            <ThemeToggle />
            <button
              type="button"
              className={styles.mobileMenuButton}
              onClick={toggleMobileMenu}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className={styles.menuIcon} />
              ) : (
                <Menu className={styles.menuIcon} />
              )}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className={styles.mobileNav}>
            <nav className={styles.mobileNavContent}>
              <Link 
                to="/events" 
                className={styles.mobileNavLink}
                onClick={closeMobileMenu}
              >
                Events
              </Link>
              
              {isAuthenticated ? (
                <>
                  <Link 
                    to="/my-bookings" 
                    className={styles.mobileNavLink}
                    onClick={closeMobileMenu}
                  >
                    My tickets
                  </Link>
                  <div className={styles.mobileUserSection}>
                    <p className={styles.mobileUserEmail}>
                      Signed in as {user?.email}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleMobileLogout}
                    >
                      Log out
                    </Button>
                  </div>
                </>
              ) : (
                <div className={styles.mobileAuthButtons}>
                  <Link to="/login" onClick={closeMobileMenu}>
                    <Button variant="outline">Log in</Button>
                  </Link>
                  <Link to="/register" onClick={closeMobileMenu}>
                    <Button variant="primary">Sign up</Button>
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
