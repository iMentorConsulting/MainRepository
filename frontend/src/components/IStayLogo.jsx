export default function IStayLogo({ variant = 'blue', className = 'h-8' }) {
  const src = variant === 'white' ? '/logo-istay-white.svg' : '/logo-istay-blue.svg'
  return <img src={src} alt="iStay" className={className} style={{ display: 'block' }} />
}
