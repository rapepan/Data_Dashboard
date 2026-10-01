import PageHeader from '../components/PageHeader';
import PlaceholderCard from '../components/PlaceholderCard';

interface PlaceholderPageProps {
  title: string;
  icon: string;
  description: string;
}

export default function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} subtitle="อยู่ระหว่างพัฒนา" />
      <PlaceholderCard icon={icon} title={title} description={description} />
    </>
  );
}
