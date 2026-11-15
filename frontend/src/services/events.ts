/**
 * Events Service - Handles event-related API calls
 */

import api from './api';
import type { Event, SeatsResponse, Venue } from '@/types';

/**
 * Get all events
 * 
 * @returns Array of events
 */
export async function getEvents(): Promise<Event[]> {
  const response = await api.get<Event[]>('/events');
  return response.data;
}

/**
 * Get a single event by ID
 * 
 * @param id - Event UUID
 * @returns Event details
 */
export async function getEvent(id: string): Promise<Event> {
  const response = await api.get<Event>(`/events/${id}`);
  return response.data;
}

/**
 * Get seats for an event
 * 
 * @param eventId - Event UUID
 * @param status - Optional filter by seat status ('available', 'reserved', 'sold')
 * @returns Seats response with seats array and summary
 */
export async function getEventSeats(
  eventId: string, 
  status?: string
): Promise<SeatsResponse> {
  const params = status ? { status } : {};
  const response = await api.get<SeatsResponse>(`/events/${eventId}/seats`, { params });
  return response.data;
}

// Admin-only endpoints: the API answers 403 for non-admins, so the UI gate is just convenience.

export async function getVenues(): Promise<Venue[]> {
  const response = await api.get<Venue[]>('/venues');
  return response.data;
}

export async function createVenue(venue: Pick<Venue, 'name' | 'address' | 'capacity'>): Promise<Venue> {
  const response = await api.post<Venue>('/venues', venue);
  return response.data;
}

export async function createEvent(
  event: Pick<Event, 'venue_id' | 'title' | 'description' | 'event_date' | 'ticket_price' | 'total_seats'>
): Promise<Event> {
  const response = await api.post<Event>('/events', event);
  return response.data;
}
