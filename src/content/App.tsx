import { NSDataProvider } from "./context/NSDataContext";
import { AppProvider } from "./context/AppContext";
import HomePage from "./pages/HomePage";

export default function App() {
  return (
    <NSDataProvider>
      <AppProvider>
        <HomePage />
      </AppProvider>
    </NSDataProvider>
  );
}
