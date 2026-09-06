/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
export interface Team {
  id: string;
  name: string;
  lead: string;
  department: string;
  count?: number;
}

export const CORPORATE_TEAMS: Team[] = [
  { id: '1', name: 'Engineering', lead: 'Sarah Chen', department: 'Technology', count: 24 },
  { id: '2', name: 'Product Growth', lead: 'Marcus Wright', department: 'Product', count: 12 },
  { id: '3', name: 'Finance Ops', lead: 'Elena Rodriguez', department: 'Finance', count: 8 },
  { id: '4', name: 'Global Sales', lead: 'James Wilson', department: 'Sales', count: 45 },
  { id: '5', name: 'Customer Success', lead: 'Amina Okafor', department: 'Support', count: 18 },
  { id: '6', name: 'Strategic HR', lead: 'David Park', department: 'HR', count: 6 },
  { id: '7', name: 'Legal Counsel', lead: 'Jennifer Low', department: 'Legal', count: 4 },
  { id: '8', name: 'Marketing', lead: 'Tom Harris', department: 'Growth', count: 15 },
  { id: '9', name: 'IT Infrastructure', lead: 'Robert Green', department: 'Technology', count: 10 },
  { id: '10', name: 'R&D Lab', lead: 'Dr. Hiroshi Tanaka', department: 'Innovation', count: 14 },
  { id: '11', name: 'Logistics', lead: 'Maria Garcia', department: 'Operations', count: 22 },
  { id: '12', name: 'Compliance', lead: 'Steven Bell', department: 'Finance', count: 5 },
];
