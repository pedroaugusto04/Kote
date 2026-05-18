import { Link } from 'react-router-dom';

import { routes } from '../../app/routing/routes';
import { authLandingContent } from '../../layouts/auth-landing.content';
import { useTypewriterWord } from '../../layouts/use-typewriter-word';

export function LandingPage() {
  const animatedWord = useTypewriterWord(authLandingContent.typewriterWords);

  return (
    <main className="landing-layout">
      <section className="landing-shell" aria-label="Knowledge Vault landing page">
        <header className="landing-topbar">
          <div className="brand landing-brand" aria-label="Knowledge Vault">
            <div className="brand-mark">KV</div>
            <div>
              <strong>Knowledge Vault</strong>
              <span>developer knowledge base</span>
            </div>
          </div>
          <div className="landing-topbar-actions">
            <Link className="filter-chip landing-button-link" to={routes.auth}>Sign in</Link>
            <Link className="icon-button landing-button-link" to={`${routes.auth}?mode=signup`}>Create account</Link>
          </div>
        </header>

        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="card-kicker">Connected technical memory</span>
            <h1 id="landing-title" aria-label={authLandingContent.title.accessible}>
              <span>{authLandingContent.title.prefix}</span>
              <span className="landing-highlight auth-typewriter-word">
                {animatedWord}
                <span className="auth-typewriter-cursor" aria-hidden="true" />
              </span>
              <span>{authLandingContent.title.suffix}</span>
            </h1>
            <p>{authLandingContent.lead}</p>
          </div>
          <div className="landing-actions">
            <Link className="icon-button landing-button-link" to={routes.auth}>Enter workspace</Link>
            <Link className="filter-chip landing-button-link" to={`${routes.auth}?mode=signup`}>Start with a new account</Link>
          </div>
        </section>

        <section className="landing-story-list" aria-label="Knowledge base workflow">
          {authLandingContent.storyCards.map((card) => (
            <article className="landing-story-card" key={card.title}>
              <div className="landing-story-copy">
                <span>{card.title}</span>
                <h2>{card.heading}</h2>
                <p>{card.description}</p>
              </div>
              <div className="landing-story-detail">
                <span>{card.detailLabel}</span>
                <strong>{card.detail}</strong>
                <div>
                  {card.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
