interface PlaceholderCardProps {
  icon: string;
  title: string;
  description: string;
}

export default function PlaceholderCard({ icon, title, description }: PlaceholderCardProps) {
  return (
    <div className="placeholder-card">
      <div className="placeholder-icon"><i className={`fa-solid ${icon}`} /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      <span className="placeholder-tag"><i className="fa-solid fa-person-digging" /> อยู่ระหว่างออกแบบ/พัฒนา</span>
    </div>
  );
}
