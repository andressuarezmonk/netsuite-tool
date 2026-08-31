import WeekGrid from "../components/blocks/WeekGrid/WeekGrid";
import WeekNav from "../components/atoms/WeekNav/WeekNav";
import AddRowBar from "../components/blocks/AddRowBar/AddRowBar";
import StatusBar from "../components/atoms/StatusBar/StatusBar";
import Header from "../components/blocks/Header/Header";
import Footer from "../components/blocks/Footer/Footer";
import styles from "./HomePage.module.scss";
import { useStore } from "../context/AppContext";

export default function HomePage() {
  const { week } = useStore();

  return (
    <div className={styles.root}>
      <Header />
      <WeekNav />
      <StatusBar />
      <WeekGrid />
      {week.initialized && <AddRowBar />}
      <Footer />
    </div>
  );
}
