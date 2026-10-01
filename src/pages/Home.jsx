import './Home.css'
import { Link } from 'react-router-dom'
import world from '../assets/world.svg'

function Home({ session }) {
  return (
    <div className="home">
        <header className="header-home">
          <h1>PinSphere</h1>
          <Link to={session ? '/map' : '/login'}>
            <button className="login-button">{session ? 'My Maps' : 'Login'}</button>
          </Link>
        </header>

        <main className="main-home">
        <img className="world-image" src={world} alt="image of the world in white"/>

          <p className="description">PinSphere is your personal map of the world. Keep track of every place you've visited,
            add dates and memories to your trips, and watch your travel history come to life.
            Create private maps for yourself or shared maps with family and friends, so everyone can contribute
            their adventures and see where you've been together. Whether you're documenting past journeys or planning the next one,
            PinSphere makes it easy to turn your travels into a map of your memories.</p>

          <Link to={session ? '/map' : '/signup'}>
            <button className="get-started-button">{session ? 'Open Map' : 'Get Started'}</button>
          </Link>
        </main>
    </div>
  )
}

export default Home
