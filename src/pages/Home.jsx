import './Home.css'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import NavbarAccount from '../components/NavbarAccount'
import preview from '../assets/pinsphere-desktop-light.png'

function Home({ session }) {
  const loginLink = useRef(null)
  const hadSession = useRef(Boolean(session))
  useEffect(() => {
    if (hadSession.current && !session) loginLink.current?.focus({ preventScroll: true })
    hadSession.current = Boolean(session)
  }, [session])
  return <div className="home">
    <header className="home-header">
      <Link className="home-brand" to="/" aria-label="PinSphere home">PinSphere</Link>
      {session ? <NavbarAccount user={session.user} /> : <Link ref={loginLink} className="home-header-action" to="/login">Log in</Link>}
    </header>
    <main className="home-main">
      <div className="home-intro">
        <h1>Every place. Every journey. Together.</h1>
        <p>Map where you've been, explore your family's travels, and keep everyone's adventures connected.</p>
        <Link className="home-primary-action" to={session ? '/map' : '/signup'}>{session ? 'Open My Maps' : 'Get Started'}</Link>
      </div>
      <figure className="home-preview">
        <div className="home-preview-frame">
          <img src={preview} width="1659" height="926" fetchPriority="high" decoding="async"
            alt="PinSphere showing an expanded Family Travels map with Dad, Mom, Me, and Sibling submaps and colored pins around the world."
            aria-describedby="home-preview-caption home-preview-credits" />
        </div>
        <figcaption>
          <p id="home-preview-caption">Example family travel map with sample destinations.</p>
          <p id="home-preview-credits" className="home-preview-credits">
            <a href="https://www.geoapify.com/">Powered by Geoapify</a>{' · '}
            <a href="https://openmaptiles.org/">© OpenMapTiles</a>{' · '}
            <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
          </p>
        </figcaption>
      </figure>
    </main>
  </div>
}

export default Home
