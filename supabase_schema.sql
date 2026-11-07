-- =============================================================================
-- Enterprise HR & Operations - Supabase Database Schema
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/<your-project-id>/sql/new
-- =============================================================================

-- Drop existing tables to refresh with full enterprise HR schema
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;

-- 1. Employees Table
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(30),
    department VARCHAR(50) NOT NULL,
    role VARCHAR(100) NOT NULL,
    manager_name VARCHAR(100),
    leave_balance INT NOT NULL DEFAULT 18,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Leave Requests Table
CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_code VARCHAR(20) UNIQUE NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    leave_type VARCHAR(50) NOT NULL DEFAULT 'Annual Leave',
    days INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Expenses Table
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_code VARCHAR(20) UNIQUE NOT NULL,
    employee_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    merchant TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending Review',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS) with Public Access policies
-- This allows the anon key from our application to read and write records securely.
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access employees" ON public.employees;
CREATE POLICY "Public access employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access leave_requests" ON public.leave_requests;
CREATE POLICY "Public access leave_requests" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access expenses" ON public.expenses;
CREATE POLICY "Public access expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed Initial Sample Data
INSERT INTO public.employees (employee_code, name, email, phone, department, role, manager_name, leave_balance, status)
VALUES
    ('EMP-101', 'Rahul Sharma', 'apasif243@gmail.com', '+91 9876543210', 'Engineering', 'Senior Frontend Developer', 'Sarah Jenkins', 18, 'Active'),
    ('EMP-102', 'Sarah Jenkins', 'sarah.jenkins@enterprise.com', '+1 415-555-0142', 'Engineering', 'VP of Engineering', 'Alex Vance', 22, 'Active'),
    ('EMP-103', 'Priya Patel', 'priya.patel@enterprise.com', '+91 9123456789', 'HR & People Operations', 'Senior HR Specialist', 'Elena Rostova', 15, 'Active'),
    ('EMP-104', 'David Kim', 'david.kim@enterprise.com', '+1 415-555-0188', 'Product', 'Principal Product Manager', 'Alex Vance', 14, 'Active'),
    ('EMP-105', 'Amit Verma', 'amit.verma@enterprise.com', '+91 9988776655', 'Engineering', 'Staff Backend Engineer', 'Sarah Jenkins', 20, 'Active');

INSERT INTO public.leave_requests (request_code, employee_name, leave_type, days, start_date, end_date, reason, status)
VALUES
    ('LV-2026-001', 'Rahul Sharma', 'Annual Leave', 3, '2026-11-10', '2026-11-12', 'Family trip & Diwali celebration', 'Pending'),
    ('LV-2026-002', 'Amit Verma', 'Sick Leave', 1, '2026-11-04', '2026-11-04', 'Viral fever recovery', 'Pending'),
    ('LV-2026-003', 'David Kim', 'Personal Leave', 2, '2026-10-15', '2026-10-16', 'Relocation & housing maintenance', 'Approved');

INSERT INTO public.expenses (expense_code, employee_name, category, amount, currency, merchant, description, status)
VALUES
    ('EXP-2026-101', 'Rahul Sharma', 'Office & Equipment', 85.00, 'USD', 'Keychron Keyboard Store', 'Ergonomic mechanical keyboard for workstation', 'Approved'),
    ('EXP-2026-102', 'Rahul Sharma', 'Client Meal', 65.50, 'USD', 'Starbucks Coffee', 'Lunch discussion with partner frontend architect', 'Approved'),
    ('EXP-2026-103', 'Sarah Jenkins', 'Travel & Lodging', 420.00, 'USD', 'Marriott Downtown', 'Hotel accommodation during Q4 Strategy Summit', 'Pending Review');
