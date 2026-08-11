import WeekGrid from "../components/blocks/WeekGrid/WeekGrid";
import WeekNav from "../components/atoms/WeekNav/WeekNav";
import AddRowBar from "../components/blocks/AddRowBar/AddRowBar";
import StatusBar from "../components/atoms/StatusBar/StatusBar";
import Header from "../components/blocks/Header/Header";
import Footer from "../components/blocks/Footer/Footer";
import styles from "./HomePage.module.scss";
import { AppContext } from "../context/AppContext";
import { useStore } from "../context/useStore";
import { useHomePageData } from "./useHomePage.data";

export default function HomePage() {
  const store = useStore();
  const actions = useHomePageData(store);

  const { initialized, ...storeState } = store;

  return (
    <AppContext.Provider value={{ ...storeState, initialized, ...actions }}>
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
