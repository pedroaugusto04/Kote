import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '../../app/routing/routes';
import { withFrontendBasePath } from '../../app/base-path';
import { useTypewriterWord } from '../../layouts/use-typewriter-word';
import { BrandMark } from '../../shared/ui/brand-mark';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import {
  GitHubIcon,
  WhatsAppIcon,
  SparklesIcon,
  GitCommitIcon,
  FileCodeIcon,
  CliIcon,
  VscodeIcon,
  GlobeIcon,
} from '../../shared/ui/icons';

const typewriterWords = ['capture', 'organize', 'retrieve', 'connect'];

interface TimelineItem {
  id: string;
  sha: string;
  author: string;
  message: string;
  status: 'traditional' | 'connected';
  file: string;
  analysisSummary: string;
  riskOrImpact: string;
  recommendation: string;
  linkedNote?: string;
}

const timelineData: TimelineItem[] = [
  {
    id: '1',
    sha: 'e4b1a29',
    author: 'pedro-eng',
    message: 'fix: decrease connection pool max from 20 to 5',
    status: 'traditional',
    file: 'src/infrastructure/database/pool.ts',
    analysisSummary: 'Connection pool reduced without documented throughput benchmarks or load testing.',
    riskOrImpact: 'High risk of connection starvation and request timeouts during concurrent background syncs.',
    recommendation: 'Document max connection rationale in an ADR note and link load test benchmarks.',
  },
  {
    id: '2',
    sha: '7f9c2d1',
    author: 'alex-dev',
    message: 'refactor: bypass redis cache on user session lookup',
    status: 'traditional',
    file: 'src/application/services/auth-session.service.ts',
    analysisSummary: 'Session cache query bypasses Redis invalidation layer without linked architectural context.',
    riskOrImpact: 'Direct PostgreSQL query load spike during peak authentication traffic.',
    recommendation: 'Link issue context and create an architecture note for the session cache deprecation.',
  },
  {
    id: '3',
    sha: '3d8a1f6',
    author: 'pedro-eng',
    message: 'feat: webhook idempotency validation with redis ttl',
    status: 'connected',
    file: 'src/interfaces/http/controllers/webhooks.controller.ts',
    analysisSummary: 'Grounded in ADR-04: Payment Webhook Idempotency. Validates X-Idempotency-Key via Redis SETNX with 24h TTL.',
    riskOrImpact: 'Guarantees zero duplicate charge processing during payment gateway network retries.',
    recommendation: 'Architectural rules validated against knowledge base. Ready for review.',
    linkedNote: 'ADR-04: Payment Webhook Idempotency',
  },
  {
    id: '4',
    sha: '9c4b8e2',
    author: 'pedro-eng',
    message: 'feat: httpOnly refresh token rotation & cookie mitigation',
    status: 'connected',
    file: 'src/adapters/auth/token-manager.ts',
    analysisSummary: 'AI pair-programming session indexed: Threat model analysis for CSRF/XSS with benchmarked cookie rotation.',
    riskOrImpact: 'Full architectural alignment and zero token leakage in browser local storage.',
    recommendation: 'Session security contract verified against RFC-12 specification.',
    linkedNote: 'RFC-12: Auth Token Security Architecture',
  },
];

export function LandingPage() {
  const { typed: animatedWord, full: fullWord } = useTypewriterWord(typewriterWords);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string>('3');

  useEffect(() => {
    const selector = '.reveal-up, .reveal-scale';
    if (typeof IntersectionObserver === 'undefined') {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => el.classList.add('active'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  const activeTimeline = timelineData.find((item) => item.id === selectedTimelineId) || timelineData[2];

  return (
    <main className="landing-layout">
      <div className="landing-grid-overlay" aria-hidden="true" />

      <section className="landing-shell" aria-label="Kote landing page">
        {/* TOPBAR / NAVIGATION */}
        <header className="landing-topbar">
          <div className="landing-topbar-inner">
            <Link className="landing-brand" to={routes.auth} aria-label="Kote Home">
              <BrandMark />
              <div className="landing-brand-text">
                <div className="landing-brand-title">
                  <strong>Kote</strong>
                </div>
                <span className="landing-brand-subtitle">Engineering Memory</span>
              </div>
            </Link>

            <nav className="landing-nav-links" aria-label="Landing page sections">
              <a href="#context-gap" className="landing-nav-link">The Gap</a>
              <a href="#ecosystem" className="landing-nav-link">Integrations</a>
              <a href="#capabilities" className="landing-nav-link">Capabilities</a>
              <a href="#ai-search" className="landing-nav-link">Ask AI</a>
            </nav>

            <div className="landing-topbar-actions">
              <ThemeToggle className="theme-toggle landing-theme-toggle" />
              <Link className="landing-button-ghost" to={routes.auth}>Sign in</Link>
              <Link className="landing-button-primary" to={`${routes.auth}?mode=signup`}>
                <span>Create account</span>
                <svg className="landing-btn-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </header>

        {/* HERO SECTION */}
        <section className="landing-section hero" aria-labelledby="landing-title">
          <div className="landing-container">
            <h1 id="landing-title" className="landing-title" aria-label="Your team writes the code. Let us capture the context.">
              <span className="landing-title-row">Your team writes the code.</span>
              <span className="landing-title-row">
                Let us{' '}
                <span className="landing-typewriter-container">
                  <span className="landing-typewriter-ghost">{fullWord}</span>
                  <span className="landing-typewriter-active">
                    {animatedWord}
                    <span className="auth-typewriter-cursor" aria-hidden="true" />
                  </span>
                </span>{' '}
                the context.
              </span>
            </h1>

            <p className="landing-lead">
              <strong className="landing-lead-bold">Git remembers what changed. Kote remembers why.</strong>
              <span className="landing-lead-desc">
                Automatically capture AI coding sessions, architecture decisions, and PR discussions to surface technical context exactly when you need it.
              </span>
            </p>

            <div className="landing-actions">
              <Link className="landing-button-primary large" to={routes.auth}>
                <span>Enter workspace</span>
                <svg className="landing-btn-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link className="landing-button-secondary large" to={`${routes.auth}?mode=signup`}>
                Start free account
              </Link>
            </div>

            {/* DASHBOARD PREVIEW SCREENSHOT IN CLEAN FRAME */}
            <div className="landing-hero-visual reveal-scale" aria-label="Kote Dashboard Preview">
              <div className="landing-frame-outer">
                <div className="landing-mock-browser-bar">
                  <div className="landing-browser-controls">
                    <span className="landing-browser-dot red" />
                    <span className="landing-browser-dot yellow" />
                    <span className="landing-browser-dot green" />
                  </div>
                  <div className="landing-mock-browser-url">
                    <span className="landing-url-lock">🔒</span>
                    <span>https://knowledgebase.sbs/kote/dashboard</span>
                  </div>
                </div>

                <div className="landing-screenshot-container">
                  <img
                    src={withFrontendBasePath('/dashboard-screenshot.png')}
                    alt="Kote Engineering Dashboard"
                    className="landing-real-screenshot"
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: THE CONTEXT GAP (INTERACTIVE TIMELINE) */}
        <section id="context-gap" className="landing-section" aria-labelledby="timeline-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">The Context Gap</span>
              <h2 id="timeline-title">The repository is clear. The reasons, not so much.</h2>
              <p>
                Standard git commits capture the diff, but lose the discussion, the alternative approaches considered, and the architectural approval.
              </p>
            </header>

            <div className="landing-timeline-card reveal-up">
              <div className="landing-timeline-split">
                {/* COMMIT LIST */}
                <div className="landing-timeline-commits">
                  <div className="landing-timeline-commits-header">
                    <span className="landing-mono-label">Git Commit Stream</span>
                  </div>

                  <div className="landing-commit-items" role="tablist">
                    {timelineData.map((item) => {
                      const isSelected = item.id === selectedTimelineId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          className={`landing-commit-row ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedTimelineId(item.id)}
                        >
                          <div className="landing-commit-status-icon">
                            <GitCommitIcon className="landing-row-icon traditional" />
                          </div>
                          <div className="landing-commit-row-details">
                            <div className="landing-commit-row-top">
                              <code className="landing-commit-sha">{item.sha}</code>
                              <span className="landing-commit-author">{item.author}</span>
                            </div>
                            <p className="landing-commit-msg">{item.message}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* CONTEXT INSPECTION PANEL */}
                <div className="landing-timeline-inspector">
                  <div className="landing-inspector-header">
                    <span className="landing-mono-label">Kote AI Review</span>
                  </div>

                  <div className="landing-inspector-body">
                    <div className="landing-inspector-meta">
                      <div className="landing-meta-pair">
                        <span className="label">Commit:</span>
                        <code>{activeTimeline.sha}</code>
                      </div>
                      <div className="landing-meta-pair">
                        <span className="label">Author:</span>
                        <span>{activeTimeline.author}</span>
                      </div>
                    </div>

                    <div className="landing-inspector-message-box">
                      <span className="landing-box-title">Commit Message</span>
                      <p className="landing-box-text">{activeTimeline.message}</p>
                    </div>

                    <div className={`landing-inspector-context-box`}>
                      <div className="landing-finding-field">
                        <span className="landing-field-label">AI Finding:</span>
                        <p>{activeTimeline.analysisSummary}</p>
                      </div>
                      <div className="landing-finding-field">
                        <span className="landing-field-label"></span>
                        <p>{activeTimeline.riskOrImpact}</p>
                      </div>
                      <div className="landing-finding-field">
                        <span className="landing-field-label">Recommendation:</span>
                        <p>{activeTimeline.recommendation}</p>
                      </div>

                      {activeTimeline.linkedNote && (
                        <div className="landing-adr-tag">
                          <FileCodeIcon className="landing-adr-icon" />
                          <span>Linked Note: <strong>{activeTimeline.linkedNote}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: INTEGRATIONS / CAPTURE ECOSYSTEM */}
        <section id="ecosystem" className="landing-section" aria-labelledby="integrations-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Unified Ingestion</span>
              <h2 id="integrations-title">Where engineering memory happens.</h2>
              <p>
                Capture context from the tools your team uses every single day — without disrupting developer flow.
              </p>
            </header>

            <div className="landing-ecosystem-grid reveal-up">
              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap github">
                    <GitHubIcon />
                  </div>
                </div>
                <h3>GitHub Repositories</h3>
                <p>Sync commit trees, pull request reviews, and issue discussions directly with your technical notes.</p>
                <div className="landing-eco-footer">
                </div>
              </div>

              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap ai">
                    <SparklesIcon />
                  </div>
                </div>
                <h3>AI Coding Sessions</h3>
                <p>Capture architecture decisions made during sessions in Antigravity, Claude Code, Cursor, or OpenCode.</p>
              </div>

              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap vscode">
                    <VscodeIcon />
                  </div>
                </div>
                <h3>VS Code Extension</h3>
                <p>Highlight code snippets and create or link knowledge base notes without leaving your editor.</p>
                <div className="landing-eco-footer">
                </div>
              </div>

              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap cli">
                    <CliIcon />
                  </div>
                </div>
                <h3>Kote CLI</h3>
                <p>Capture quick terminal notes, query technical memory with natural language, and sync local AI sessions.</p>
              </div>

              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap chat">
                    <WhatsAppIcon />
                  </div>
                </div>
                <h3>Chat & Messaging</h3>
                <p>Forward key decisions from WhatsApp or team channels directly to Kote's AI ingestion pipeline.</p>
              </div>

              <div className="landing-ecosystem-card">
                <div className="landing-eco-header">
                  <div className="landing-eco-icon-wrap browser">
                    <GlobeIcon />
                  </div>
                </div>
                <h3>Browser Extension</h3>
                <p>Clip API docs, RFCs, StackOverflow fixes, and GitHub gists with clean markdown extraction.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: DEVELOPER CAPABILITIES */}
        <section id="capabilities" className="landing-section" aria-labelledby="capabilities-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Developer First</span>
              <h2 id="capabilities-title">Engineered for technical precision.</h2>
              <p>
                Everything in Kote is built to reduce cognitive load and keep your team aligned.
              </p>
            </header>

            <div className="landing-bento-grid reveal-up">
              {/* CAPABILITY 1: KNOWLEDGE MAP SPOTLIGHT */}
              <div className="landing-bento-item">
                <div className="landing-bento-copy">
                  <h3>Interactive Project Knowledge Map</h3>
                  <p>
                    Visualize dependencies, connected notes, and architectural clusters across your repositories. Spot orphaned code and undocumented modules at a glance.
                  </p>
                </div>
                <div className="landing-bento-visual map-preview">
                  <img
                    src={withFrontendBasePath('/Kote-Map.png')}
                    alt="Kote Interactive Knowledge Map"
                    className="landing-bento-img"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* CAPABILITY 2: CLI TERMINAL */}
              <div className="landing-bento-item">
                <div className="landing-bento-copy">
                  <h3>Zero Context Switching with CLI</h3>
                  <p>
                    Capture notes, query technical memory, and sync local AI coding sessions directly from your terminal.
                  </p>
                </div>
                <div className="landing-bento-visual terminal-preview">
                  <div className="landing-mock-terminal">
                    <div className="landing-mock-terminal-bar">
                      <span className="terminal-dot" />
                      <span className="terminal-dot" />
                      <span className="terminal-dot" />
                      <span className="terminal-title">zsh — kote</span>
                    </div>
                    <div className="landing-mock-terminal-body">
                      <div className="terminal-line"><span className="p">$</span> kote "ADR-04: Implement exponential backoff" -p backend</div>
                      <div className="terminal-response green">✔ Success! Created note in project: backend</div>
                      <div className="terminal-line"><span className="p">$</span> kote ask "How is webhook signature verified?"</div>
                      <div className="terminal-response cyan">✔ Search complete!</div>
                      <div className="terminal-response-detail">"Webhook signatures are verified using HMAC-SHA256 with timestamp validation."</div>
                      <div className="terminal-response-sources">Sources: ADR-04: Resilient Ingestion Standard</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: ASK AI SEMANTIC SEARCH DEEP-DIVE */}
        <section id="ai-search" className="landing-section" aria-labelledby="ai-search-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Ask AI</span>
              <h2 id="ai-search-title">Semantic Search & AI Assistant</h2>
              <p>
                Retrieve exact answers with direct citations to your notes, code references, and team decisions.
              </p>
            </header>

            <div className="landing-ai-search-frame reveal-scale">
              <div className="landing-mock-browser-bar">
                <div className="landing-browser-controls">
                  <span className="landing-browser-dot red" />
                  <span className="landing-browser-dot yellow" />
                  <span className="landing-browser-dot green" />
                </div>
                <div className="landing-mock-browser-url">
                  <span className="landing-url-lock">🔒</span>
                  <span>https://knowledgebase.sbs/kote/search</span>
                </div>
              </div>

              <div className="landing-screenshot-container">
                <img
                  src={withFrontendBasePath('/search-screenshot.png')}
                  alt="Ask AI Semantic Search in Kote"
                  className="landing-real-screenshot"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: CALL TO ACTION */}
        <section className="landing-section landing-cta-section" aria-label="Get started call to action">
          <div className="landing-container">
            <div className="landing-cta-banner reveal-scale">
              <div className="landing-cta-inner">
                <span className="landing-kicker cta-kicker">Start Today</span>
                <h2>Bring clarity to your engineering memory.</h2>
                <p>
                  Start capturing knowledge where engineering already happens and keep your technical context connected to the projects that need them next.
                </p>
                <div className="landing-actions">
                  <Link className="landing-button-primary large" to={routes.auth}>
                    <span>Enter workspace</span>
                    <svg className="landing-btn-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                  <Link className="landing-button-secondary large" to={`${routes.auth}?mode=signup`}>
                    Create free account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="landing-footer">
          <div className="landing-container">
            <div className="landing-footer-grid">
              <div className="landing-footer-brand">
                <div className="landing-brand">
                  <BrandMark />
                  <strong>Kote</strong>
                </div>
                <p className="landing-footer-tagline">
                  Engineering knowledge management & context layer for modern technical teams.
                </p>
              </div>

              <div className="landing-footer-col">
                <strong>Product</strong>
                <a href="#context-gap">The Context Gap</a>
                <a href="#ecosystem">Integrations</a>
                <a href="#capabilities">Knowledge Map</a>
                <a href="#ai-search">Ask AI Assistant</a>
              </div>

              <div className="landing-footer-col">
                <strong>Ecosystem</strong>
                <Link to={routes.auth}>Web Application</Link>
                <a href="https://www.npmjs.com/package/@pedroaugusto04/kote-cli" target="_blank" rel="noopener noreferrer">
                  CLI Package
                </a>
                <Link to={routes.extensionPrivacy}>Browser Extension</Link>
                <Link to={routes.help}>Documentation</Link>
              </div>

              <div className="landing-footer-col">
                <strong>Connect</strong>
                <a href="mailto:pedroaugustoaduarte@gmail.com">Contact Support</a>
                <Link to={routes.auth}>Sign In</Link>
                <Link to={`${routes.auth}?mode=signup`}>Create Workspace</Link>
              </div>
            </div>

            <div className="landing-footer-bottom">
              <span>© 2026 Kote. All rights reserved.</span>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}


