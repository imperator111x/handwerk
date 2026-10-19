-- Ein Postfach kann mehreren Benutzern gehören.
CREATE TABLE IF NOT EXISTS mailbox_members (
  mailbox_id INTEGER NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (mailbox_id, user_id)
);

INSERT INTO mailbox_members (mailbox_id, user_id)
SELECT m.id, m.user_id
  FROM mailboxes m
 WHERE m.user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM mailbox_members mm
      WHERE mm.mailbox_id = m.id AND mm.user_id = m.user_id
   );

CREATE INDEX IF NOT EXISTS idx_mailbox_members_user ON mailbox_members(user_id);
