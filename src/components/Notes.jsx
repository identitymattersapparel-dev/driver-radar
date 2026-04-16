import { isValidNote } from "../utils/notes";
import { formatNoteTime } from "../utils/time";

export default function NotesPanel({ notes, onClose }) {
  const sorted = [...notes]
    .filter(isValidNote)
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div
      className="np-overlay"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="np-sheet">
        <div className="np-header">
          <div>
            <div className="np-title">Route Notes</div>
            <div className="np-count">
              {sorted.length} {sorted.length === 1 ? "note" : "notes"} this route
            </div>
          </div>
          <div className="np-close" onClick={onClose}>✕</div>
        </div>

        {sorted.length === 0 ? (
          <div className="np-empty">
            <span className="np-empty-text">No notes yet</span>
          </div>
        ) : (
          <div className="np-list">
            {sorted.map((note) => (
              <div key={note.id} className="np-note">
                <div className="np-note-meta">
                  <div className="np-note-stop-block">
                    <span className="np-note-stop">Stop #{note.stopNumber}</span>
                    {note.locationKey && (
                      <span className="np-note-location">{note.locationKey}</span>
                    )}
                  </div>
                  <span className="np-note-time">{formatNoteTime(note.createdAt)}</span>
                </div>
                <div className="np-note-text">{note.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
