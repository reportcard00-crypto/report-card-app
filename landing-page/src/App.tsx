import './App.css'

// Brand colors
const colors = {
  primary: '#1e3a5f',
  primaryDark: '#152a45',
  accent: '#e67e22',
  accentLight: '#f39c12',
  accentDark: '#d35400',
  success: '#27ae60',
}

// SVG Icons as components
const CheckIcon = () => (
  <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20" style={{ color: colors.success }}>
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
)

const MenuIcon = () => (
  <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

// Feature icons
const UploadIcon = () => (
  <svg className="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
)

const TestIcon = () => (
  <svg className="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)

const ReportIcon = () => (
  <svg className="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const ClassroomIcon = () => (
  <svg className="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

// Hero illustration component
const HeroIllustration = () => (
  <div className="illustration-wrapper">
    {/* Main computer screen */}
    <div className="illustration-main">
      <svg viewBox="0 0 400 300">
        {/* Monitor */}
        <rect x="50" y="30" width="300" height="180" rx="12" fill={colors.primary} />
        <rect x="60" y="40" width="280" height="155" rx="6" fill="#ffffff" />
        
        {/* Screen content - checklist */}
        <rect x="80" y="60" width="18" height="18" rx="3" stroke={colors.primary} strokeWidth="2" fill="none" />
        <path d="M84 69 L88 73 L94 64" stroke={colors.success} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="108" y="64" width="90" height="10" rx="3" fill="#e2e8f0" />
        
        <rect x="80" y="90" width="18" height="18" rx="3" stroke={colors.primary} strokeWidth="2" fill="none" />
        <rect x="108" y="94" width="110" height="10" rx="3" fill="#e2e8f0" />
        
        <rect x="80" y="120" width="18" height="18" rx="3" stroke={colors.primary} strokeWidth="2" fill="none" />
        <rect x="108" y="124" width="70" height="10" rx="3" fill="#e2e8f0" />
        
        {/* Chart on screen */}
        <rect x="230" y="55" width="95" height="90" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
        <rect x="248" y="115" width="18" height="22" rx="2" fill={colors.success} />
        <rect x="272" y="95" width="18" height="42" rx="2" fill={colors.accent} />
        <rect x="296" y="75" width="18" height="62" rx="2" fill="#3b82f6" />
        
        {/* Monitor stand */}
        <path d="M175 210 L225 210 L215 230 L185 230 Z" fill={colors.primary} />
        <rect x="160" y="230" width="80" height="12" rx="4" fill={colors.primary} />
      </svg>
    </div>
    
    {/* Floating elements */}
    <div className="floating-card floating-card-1">
      <div className="floating-card-content">
        <div className="percentage-circle">
          <span className="percentage-text">85%</span>
        </div>
      </div>
    </div>
    
    <div className="floating-card floating-card-2">
      <div className="floating-card-content">
        <CheckIcon />
        <span className="check-text">Test Complete</span>
      </div>
    </div>
    
    {/* Decorative dots */}
    <div className="decorative-dot dot-1" />
    <div className="decorative-dot dot-2" />
    <div className="decorative-dot dot-3" />
  </div>
)

function App() {
  return (
    <div className="page-wrapper">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            {/* Logo */}
            <div className="logo">
              <img src="/logo.png" alt="ParikshaLab" />
            </div>
            
            {/* Desktop Navigation */}
            <nav className="nav-desktop">
              <a href="#home" className="nav-link active">Home</a>
              <a href="#features" className="nav-link">Upload Questions</a>
              <a href="#features" className="nav-link">Create Tests</a>
              <a href="#features" className="nav-link">Reports</a>
            </nav>
            
            {/* Auth Buttons */}
            <div className="auth-buttons">
              <a href="https://app.parikshalab.com" className="btn btn-outline">Log in</a>
              <a href="https://app.parikshalab.com" className="btn btn-primary">Sign up</a>
            </div>
            
            {/* Mobile Menu Button */}
            <button className="mobile-menu-btn">
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>
      
      {/* Hero Section */}
      <section id="home" className="hero">
        <div className="container">
          <div className="hero-grid">
            {/* Left Content */}
            <div className="hero-content">
              <h1 className="hero-title">
                <span style={{ color: colors.primary }}>Effortlessly Create Online </span>
                <span style={{ color: colors.accent }}>Tests</span>
                <span style={{ color: colors.primary }}> from Question Banks</span>
              </h1>
              <p className="hero-description">
                Upload question banks, generate tests, and receive detailed performance reports.
              </p>
              <div className="hero-buttons">
                <a href="https://app.parikshalab.com" className="btn btn-primary btn-large btn-shadow">
                  Get Started
                </a>
                <button className="btn btn-secondary btn-large">
                  Watch Demo
                </button>
              </div>
              
              {/* Stats */}
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-number">10K+</div>
                  <div className="stat-label">Tests Created</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">50K+</div>
                  <div className="stat-label">Questions</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">5K+</div>
                  <div className="stat-label">Teachers</div>
                </div>
              </div>
            </div>
            
            {/* Right Illustration */}
            <div className="hero-illustration">
              <HeroIllustration />
              
              {/* Background blobs */}
              <div className="hero-blob hero-blob-1" />
              <div className="hero-blob hero-blob-2" />
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">
              <span style={{ color: colors.primary }}>Everything You Need to Create </span>
              <span style={{ color: colors.accent }}>Better Tests</span>
            </h2>
            <p className="section-subtitle">
              Powerful features designed to make test creation and management effortless
            </p>
          </div>
          
          <div className="features-grid">
            {/* Feature 1 */}
            <div className="feature-card">
              <div 
                className="feature-icon"
                style={{ backgroundColor: `${colors.accent}15`, color: colors.accent }}
              >
                <UploadIcon />
              </div>
              <h3 className="feature-title">Upload Questions</h3>
              <p className="feature-description">
                Easily upload your question banks in various formats including PDF, Excel, and more.
              </p>
            </div>
            
            {/* Feature 2 */}
            <div className="feature-card">
              <div 
                className="feature-icon"
                style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
              >
                <TestIcon />
              </div>
              <h3 className="feature-title">Generate Tests</h3>
              <p className="feature-description">
                Create customized tests automatically with smart question selection algorithms.
              </p>
            </div>
            
            {/* Feature 3 */}
            <div className="feature-card">
              <div 
                className="feature-icon"
                style={{ backgroundColor: `${colors.success}15`, color: colors.success }}
              >
                <ReportIcon />
              </div>
              <h3 className="feature-title">Detailed Reports</h3>
              <p className="feature-description">
                Get comprehensive analytics and insights on student performance and progress.
              </p>
            </div>
            
            {/* Feature 4 */}
            <div className="feature-card">
              <div 
                className="feature-icon"
                style={{ backgroundColor: '#3b82f615', color: '#3b82f6' }}
              >
                <ClassroomIcon />
              </div>
              <h3 className="feature-title">Manage Classrooms</h3>
              <p className="feature-description">
                Organize students into classrooms and track their progress over time.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* How it Works Section */}
      <section className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">
              <span style={{ color: colors.primary }}>How It </span>
              <span style={{ color: colors.accent }}>Works</span>
            </h2>
            <p className="section-subtitle">
              Get started in three simple steps
            </p>
          </div>
          
          <div className="steps-container">
            {/* Connecting line */}
            <div className="steps-line" />
            
            {/* Step 1 */}
            <div className="step">
              <div className="step-number" style={{ backgroundColor: colors.accent }}>
                1
              </div>
              <h3 className="step-title">Upload Questions</h3>
              <p className="step-description">
                Import your existing question banks or create new questions using our editor.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="step">
              <div className="step-number" style={{ backgroundColor: colors.primary }}>
                2
              </div>
              <h3 className="step-title">Create Tests</h3>
              <p className="step-description">
                Generate tests automatically or manually select questions for your assessment.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="step">
              <div className="step-number" style={{ backgroundColor: colors.success }}>
                3
              </div>
              <h3 className="step-title">Get Reports</h3>
              <p className="step-description">
                Share tests with students and receive detailed performance analytics.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2 className="cta-title">
              Ready to Transform Your Testing Experience?
            </h2>
            <p className="cta-description">
              Join thousands of educators who are already using ParikshaLab to create better assessments.
            </p>
            <div className="cta-buttons">
              <a href="https://app.parikshalab.com" className="btn btn-primary btn-large btn-shadow">
                Start Free Trial
              </a>
              <button className="btn-cta-outline">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            {/* Brand */}
            <div className="footer-brand">
              <img src="/logo.png" alt="ParikshaLab" />
              <p>Making test creation effortless for educators worldwide.</p>
            </div>
            
            {/* Quick Links */}
            <div className="footer-column">
              <h4>Quick Links</h4>
              <ul className="footer-links">
                <li><a href="#">Home</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#">Pricing</a></li>
                <li><a href="#">Contact</a></li>
              </ul>
            </div>
            
            {/* Resources */}
            <div className="footer-column">
              <h4>Resources</h4>
              <ul className="footer-links">
                <li><a href="#">Documentation</a></li>
                <li><a href="#">Help Center</a></li>
                <li><a href="#">Blog</a></li>
                <li><a href="#">API</a></li>
              </ul>
            </div>
            
            {/* Contact */}
            <div className="footer-column">
              <h4>Contact</h4>
              <ul className="footer-contact">
                <li>support@parikshalab.com</li>
                <li>+91 1234567890</li>
              </ul>
              <div className="social-links">
                <a href="#" className="social-link">
                  <svg fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
                </a>
                <a href="#" className="social-link">
                  <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="#" className="social-link">
                  <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                </a>
              </div>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} ParikshaLab. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
