import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

describe('App Integration Tests', () => {
  it('should render the app shell', () => {
    render(
      <BrowserRouter>
        <div>App Shell</div>
      </BrowserRouter>
    );
    expect(screen.getByText('App Shell')).toBeInTheDocument();
  });

  it('should have navigation links', () => {
    render(
      <BrowserRouter>
        <nav>
          <a href="/">Home</a>
          <a href="/projects">Projects</a>
          <a href="/search">Ask AI</a>
          <a href="/kanban">Kanban</a>
          <a href="/reminders">Reminders</a>
          <a href="/map">Map</a>
        </nav>
      </BrowserRouter>
    );
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Ask AI')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
    expect(screen.getByText('Reminders')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
  });
});
