import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '../../app/routing/routes';
import { withFrontendBasePath } from '../../app/base-path';
import { useTypewriterWord } from '../../layouts/use-typewriter-word';
import { logApplicationAccess } from '../../shared/api/client';
import { BrandMark } from '../../shared/ui/brand-mark';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { GitHubIcon, WhatsAppIcon, TelegramIcon, SparklesIcon, PencilIcon } from '../../shared/ui/icons';

const typewriterWords = ['capture', 'organize', 'retrieve', 'connect'];

export function LandingPage() {
  const { typed: animatedWord, full: fullWord } = useTypewriterWord(typewriterWords);

  useEffect(() => {
    void logApplicationAccess().catch(() => {
      // Best-effort telemetry: landing access should not block rendering.
    });
  }, []);

  useEffect(() => {
    const selector = '.reveal-up, .reveal-left, .reveal-right, .reveal-scale';
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
        threshold: 0.05,
        rootMargin: '0px 0px -60px 0px',
      }
    );

    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  return (
    <main className="landing-layout">
      <section className="landing-shell" aria-label="Kote landing page">

        {/* HEADER / TOPBAR */}
        <header className="landing-topbar">
          <Link className="landing-brand" to={routes.auth} aria-label="Kote">
            <BrandMark />
            <div>
              <strong>Kote</strong>
              <span>Your Team's Second Brain</span>
            </div>
          </Link>
          <div className="landing-topbar-actions">
            <ThemeToggle className="theme-toggle landing-theme-toggle" />
            <Link className="landing-button-link" to={routes.auth}>Sign in</Link>
            <Link className="landing-button-link primary" to={`${routes.auth}?mode=signup`}>Create account</Link>
          </div>
        </header>

        {/* HERO SECTION */}
        <section className="landing-section hero" aria-labelledby="landing-title">
          <div className="landing-container">
            <span className="landing-kicker">Connected technical memory</span>
            <h1 id="landing-title" className="landing-title" aria-label="Your team writes the code. Let us capture the context.">
              Your team writes the code. Let us <span className="landing-highlight auth-typewriter-word" style={{ position: 'relative', display: 'inline-block' }}><span style={{ visibility: 'hidden', userSelect: 'none', pointerEvents: 'none' }}>{fullWord}</span><span style={{ position: 'absolute', left: 0, bottom: 0, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>{animatedWord}<span className="auth-typewriter-cursor" aria-hidden="true" /></span></span> the context.
            </h1>
            <p className="landing-lead">
              Keep AI sessions, GitHub PR reviews, WhatsApp & Telegram messages, decisions, and reminders unified.
              Turn unstructured engineering chat into searchable context.
            </p>
            <div className="landing-actions">
              <Link className="landing-button-link primary" to={routes.auth}>Enter workspace</Link>
              <Link className="landing-button-link secondary" to={`${routes.auth}?mode=signup`}>Start with a new account</Link>
            </div>

            {/* DASHBOARD PREVIEW SCREENSHOT */}
            <div className="landing-dashboard-wrapper" aria-label="Kote Dashboard Preview">
              <div className="landing-mock-browser-bar">
                <div className="landing-mock-browser-dot" />
                <div className="landing-mock-browser-dot" />
                <div className="landing-mock-browser-dot" />
                <div className="landing-mock-browser-url">https://knowledgebase.sbs/kote/</div>
              </div>
              <img src={withFrontendBasePath('/dashboard-screenshot.png')} alt="Kote Dashboard" className="landing-real-screenshot" />
            </div>
          </div>
        </section>

        {/* TIMELINE GAP SECTION */}
        <section className="landing-section" aria-labelledby="timeline-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">The Context Gap</span>
              <h2 id="timeline-title">The repository is clear. The reasons, not so much.</h2>
              <p>
                Standard git history tells you what changed, but rarely explains the why behind critical decisions.
                We bridge that context gap.
              </p>
            </header>

            <div className="landing-commit-timeline reveal-scale">
              <div className="landing-timeline-rail" />
              <div className="landing-timeline-nodes">
                <div className="landing-timeline-node amber">
                  <div className="landing-timeline-tooltip">
                    <h4>commit 4d2e9a: fix retry</h4>
                    <p>"Why did we use 5s? Who approved it? Chat thread is lost."</p>
                  </div>
                </div>
                <div className="landing-timeline-node amber">
                  <div className="landing-timeline-tooltip">
                    <h4>commit 9b8c1a: update webhook</h4>
                    <p>"Config changed without an issue link or review description."</p>
                  </div>
                </div>
                <div className="landing-timeline-node cyan">
                  <div className="landing-timeline-tooltip">
                    <h4>commit 1e4f2b: exponential backoff</h4>
                    <p>"Linked to Kote note: Standard retry-policy. Context preserved."</p>
                  </div>
                </div>
                <div className="landing-timeline-node cyan">
                  <div className="landing-timeline-tooltip">
                    <h4>commit 8a3f9c: add telemetry</h4>
                    <p>"PR has 14 inline review findings captured as actionable issues."</p>
                  </div>
                </div>
                <div className="landing-timeline-node green">
                  <div className="landing-timeline-tooltip">
                    <h4>commit 2d7b4e: release v1.4</h4>
                    <p>"All critical architecture context locked in and fully indexed."</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS MAP SECTION */}
        <section className="landing-section" aria-labelledby="integrations-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Unified Context</span>
              <h2 id="integrations-title">Where engineering memory lives.</h2>
              <p>
                Kote seamlessly bridges the gap between your communication channels and your codebase,
                automatically grouping files and discussions.
              </p>
            </header>

            <div className="landing-integration-container reveal-scale">
              <div className="landing-integration-center">
                <BrandMark />
                <strong>Active Context Hub</strong>
                <span>Unified Knowledge</span>
              </div>

              <svg className="landing-integration-svg" viewBox="0 0 1000 380" aria-hidden="true">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-soft)" />
                  </marker>
                </defs>
                <path d="M 220 70 L 440 140" stroke="var(--line-soft)" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow)" />
                <path d="M 780 60 L 560 140" stroke="var(--line-soft)" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow)" />
                <path d="M 180 320 L 440 240" stroke="var(--line-soft)" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow)" />
                <path d="M 820 330 L 560 240" stroke="var(--line-soft)" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              </svg>

              <div className="landing-integration-card c1">
                <span className="landing-integration-card-icon"><GitHubIcon /></span>
                <span>GitHub Sync</span>
              </div>
              <div className="landing-integration-card c2">
                <span className="landing-integration-card-icon"><SparklesIcon /></span>
                <span>AI Sessions</span>
              </div>
              <div className="landing-integration-card c3">
                <span className="landing-integration-card-icon"><WhatsAppIcon /></span>
                <span>Messages</span>
              </div>
              <div className="landing-integration-card c4">
                <span className="landing-integration-card-icon"><WhatsAppIcon /></span>
                <span>WhatsApp</span>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES GRID SECTION */}
        <section className="landing-section landing-grid-bg" aria-labelledby="features-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Features Grid</span>
              <h2 id="features-title">With Kote, you don't need to guess.</h2>
              <p>
                The time between understanding and acting decreases — and clarity becomes part of the process.
              </p>
            </header>

            <div className="landing-features-grid">

              <div className="landing-feature-card reveal-scale">
                <div className="landing-feature-copy">
                  <span>Impact & Priorities</span>
                  <h3>Prioritize what needs engineering alignment.</h3>
                  <p>
                    Identify knowledge gaps, critical architectural changes, and overdue review findings
                    based on real-world updates and repository history.
                  </p>
                </div>
                <div className="landing-feature-visual">
                  <div className="landing-mock-evidence">
                    <div className="landing-mock-priority-item">
                      <div className="landing-mock-priority-header">
                        <span className="landing-badge danger">High Impact</span>
                        <span className="landing-mock-meta">n8n-automations / 14 reports</span>
                      </div>
                      <h4>Fragmented staging telemetry</h4>
                      <p>Multiple trace drop events occurred on production webhook sync.</p>
                    </div>
                    <div className="landing-mock-priority-item">
                      <div className="landing-mock-priority-header">
                        <span className="landing-badge warning">Medium Impact</span>
                        <span className="landing-mock-meta">telemetry-service / 6 logs</span>
                      </div>
                      <h4>Vague auth exceptions</h4>
                      <p>Cognito configuration returned unmapped auth flow exceptions.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ASK AI SEMANTIC SEARCH */}
        <section className="landing-section" aria-labelledby="ai-search-title">
          <div className="landing-container">
            <header className="landing-section-header reveal-up">
              <span className="landing-kicker">Ask AI</span>
              <h2 id="ai-search-title">Semantic Search & AI Assistant</h2>
              <p>
                Get direct answers from your knowledge base notes using advanced semantic embeddings.
              </p>
            </header>

            <div className="landing-ai-search-wrapper">
              <div className="landing-ai-search-info reveal-up">
                <h3>Find context by meaning, not just keywords.</h3>
                <p>
                  Engineering discussions and notes are fragmented. Our AI Search queries the semantic
                  intent of your query, finding relevant context even when keywords don't match.
                </p>
                <div className="landing-ai-search-features">
                  <div className="landing-ai-search-feature-item">
                    <span className="landing-ai-search-feature-icon">✨</span>
                    <div className="landing-ai-search-feature-content">
                      <h4>Natural Language Answers</h4>
                      <p>Ask questions like "How do we handle retry timeouts?" and get direct answers synthesized from notes.</p>
                    </div>
                  </div>
                  <div className="landing-ai-search-feature-item">
                    <span className="landing-ai-search-feature-icon">🗂️</span>
                    <div className="landing-ai-search-feature-content">
                      <h4>Project-Scoped Search</h4>
                      <p>Filter searches to specific active repositories, or run global workspace-wide assistant runs.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="landing-ai-search-visual reveal-scale">
                <div className="landing-dashboard-wrapper large-preview" aria-label="Ask AI Assistant Preview">
                  <div className="landing-mock-browser-bar">
                    <div className="landing-mock-browser-dot" />
                    <div className="landing-mock-browser-dot" />
                    <div className="landing-mock-browser-dot" />
                    <div className="landing-mock-browser-url">https://knowledgebase.sbs/knowledge-base/search</div>
                  </div>
                  <img src={withFrontendBasePath('/search-screenshot.png')} alt="Ask AI Assistant" className="landing-real-screenshot" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CALL TO ACTION BANNER */}
        <section className="landing-section landing-cta-section" aria-label="Get started call to action">
          <div className="landing-container">
            <div className="landing-cta-banner reveal-scale">
              <h2>Bring clarity to your codebase.</h2>
              <p>
                Start capturing knowledge where engineering already happens and keep your technical context
                connected to the projects that need them next.
              </p>
              <div className="landing-actions" style={{ marginBottom: 0 }}>
                <Link className="landing-button-link primary" to={routes.auth}>Enter workspace</Link>
                <Link className="landing-button-link secondary" to={`${routes.auth}?mode=signup`}>Create an account</Link>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="landing-footer">
          <div className="landing-footer-content">
            <div className="landing-footer-logo">
              <BrandMark />
              <strong>Kote</strong>
            </div>
            <div className="landing-footer-meta">
              <span>Knowledge management for modern engineering teams.</span>
              <a href="mailto:pedroaugustoaduarte@gmail.com">Contact Support</a>
              <span>© 2026 Kote. All rights reserved.</span>
            </div>
          </div>
        </footer>

      </section>
    </main>
  );
}
