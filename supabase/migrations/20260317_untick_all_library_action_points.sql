-- Migration: Untick all action points in the Library
-- This sets all action points in the action_points table to completed = false
-- Action points in the Library are templates that are shared across all clients

UPDATE action_points
SET completed = false
WHERE completed = true;
