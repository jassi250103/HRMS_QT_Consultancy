-- 003_staff_profile.sql — personal record columns on staff, plus the upward reporting line.
--
-- The profile page shows the signed-in person's own gender, date of birth, contact details and
-- joining date. Everyone else's stays masked, so these columns are only ever readable by the
-- owner and the HR Admin (enforced in routes/staff.js).

ALTER TABLE staff
  ADD COLUMN gender   text NOT NULL DEFAULT '',
  ADD COLUMN dob      date,
  ADD COLUMN mobile   text NOT NULL DEFAULT '',
  ADD COLUMN email    text NOT NULL DEFAULT '',
  ADD COLUMN address  text NOT NULL DEFAULT '',
  ADD COLUMN doj      date,
  ADD COLUMN hr       text NOT NULL DEFAULT '',
  ADD COLUMN cluster  text NOT NULL DEFAULT '';

-- The line above a person, nearest manager first, used to draw the reporting chain.
CREATE FUNCTION staff_ancestors(leaf uuid) RETURNS TABLE (staff_id uuid, depth integer)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE line AS (
    SELECT s.id AS staff_id, s.manager_id, 0 AS depth
      FROM staff s WHERE s.id = leaf
    UNION ALL
    SELECT st.id, st.manager_id, line.depth + 1
      FROM staff st JOIN line ON st.id = line.manager_id
  )
  SELECT staff_id, depth FROM line ORDER BY depth;
$$;
