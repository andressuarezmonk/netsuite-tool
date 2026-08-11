import WeekGrid from "../components/blocks/WeekGrid/WeekGrid";
import WeekNav from "../components/atoms/WeekNav/WeekNav";
import AddRowBar from "../components/blocks/AddRowBar/AddRowBar";
import StatusBar from "../components/atoms/StatusBar/StatusBar";
import Header from "../components/blocks/Header/Header";
import Footer from "../components/blocks/Footer/Footer";
import styles from "./HomePage.module.scss";
import { AppContext } from "../context/AppContext";
import { useHomePageState } from "../hooks/useHomePageState";

export default function HomePage() {
  const store = useHomePageState();
  const { initialized } = store;

  return (
    <AppContext.Provider value={store}>
      <div className={styles.root}>
        <Header />
        <WeekNav />
        <StatusBar />
        <WeekGrid />
        {initialized && <AddRowBar />}
        <Footer />
      </div>
    </AppContext.Provider>
  );
}
