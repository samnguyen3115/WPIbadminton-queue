# Badminton Queue Management System

A web application for managing player queues and court assignments for badminton clubs.

## Features

- Advanced and intermediate player queues
- Court assignments with drag-and-drop support
- Training court designation
- Player statistics tracking (wins/losses)
- Court rotation system
- Local-first data storage with optional Firebase sync
- Automatic court filling and balancing

## Project Structure

The project is organized into modular JavaScript files for better maintainability:

### Database Layer

- `js/db/firebase.js` - Firebase database operations
- `js/db/local-storage.js` - Local storage operations

### Models

- `js/models/player.js` - Player data model and operations
- `js/models/court.js` - Court data model and operations

### Controllers

- `js/controllers/court-management.js` - Court management logic
- `js/controllers/queue-management.js` - Queue management logic
- `js/controllers/auto-fill.js` - Auto-filling and court balancing algorithms

### UI Components

- `js/ui/render.js` - UI rendering functions
- `js/ui/drag-drop.js` - Drag and drop functionality

### Core

- `js/main.js` - Application initialization and core functionality
- `config.js` - Firebase configuration

### Legacy

- `script.js` - Original monolithic script (being phased out)

## Data Flow

1. Application initializes from `main.js`
2. Data is loaded from local storage first via `local-storage.js`
3. Firebase sync occurs if online mode is enabled via `firebase.js`
4. UI is rendered using functions from `render.js`
5. User interactions are processed by respective controller modules
6. Data changes are saved to local storage immediately and synchronized to Firebase periodically

## Player Data Structure

```javascript
{
  name: "Player Name",
  qualification: "advanced" | "intermediate",
  status: "queue-advanced" | "queue-intermediate" | "G1" | "G2" | "G3" | "G4" | "W1" | "W2" | "W3" | "W4",
  order: 1672531200000, // Timestamp for queue order
  isNew: true | false, // Flag for newly added players
  stats: {
    wins: 0,
    losses: 0
  },
  modified: true | false // Flag for syncing
}
```

## Court Types

Courts can be designated as:
- `advanced` - For advanced players only
- `intermediate` - For all players
- `training` - Not used for regular play

## Local-First Architecture

The application uses a local-first approach:
1. All changes are saved to local storage immediately
2. Changes are marked with `modified: true`
3. Periodic sync with Firebase happens in the background
4. This approach provides offline capability and faster UI updates

## Development Notes

- G courts (G1-G4) and W courts (W1-W4) are paired, with G courts being primary
- W courts inherit court type from their paired G court
- Courts in "training" mode cannot have players assigned
- Auto-filling prioritizes G courts before W courts

## Recommended Browser Support

- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari (latest)
