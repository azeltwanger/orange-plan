import Budget from './pages/Budget';
import DCAStrategy from './pages/DCAStrategy';
import Dashboard from './pages/Dashboard';
import EstateSecurity from './pages/EstateSecurity';
import Features from './pages/Features';
import FeeAnalysis from './pages/FeeAnalysis';
import FinancialPlan from './pages/FinancialPlan';
import Goals from './pages/Goals';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Liabilities from './pages/Liabilities';
import Performance from './pages/Performance';
import Pricing from './pages/Pricing';
import Scenarios from './pages/Scenarios';
import Settings from './pages/Settings';
import TaxCenter from './pages/TaxCenter';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Budget": Budget,
    "DCAStrategy": DCAStrategy,
    "Dashboard": Dashboard,
    "EstateSecurity": EstateSecurity,
    "Features": Features,
    "FeeAnalysis": FeeAnalysis,
    "FinancialPlan": FinancialPlan,
    "Goals": Goals,
    "Home": Home,
    "Landing": Landing,
    "Liabilities": Liabilities,
    "Performance": Performance,
    "Pricing": Pricing,
    "Scenarios": Scenarios,
    "Settings": Settings,
    "TaxCenter": TaxCenter,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};