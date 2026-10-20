-- info@ ist kein Panel-Postfach mehr, sondern eine normale Adresse.
DELETE FROM mail_messages
 WHERE thread_id IN (
   SELECT id FROM mail_threads
    WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE local_part = 'info')
 );

DELETE FROM mail_threads
 WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE local_part = 'info');

DELETE FROM mailbox_members
 WHERE mailbox_id IN (SELECT id FROM mailboxes WHERE local_part = 'info');

DELETE FROM mailboxes WHERE local_part = 'info';
