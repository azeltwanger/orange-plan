import Dashboard from './pages/Dashboard';
import Performance from './pages/Performance';
import FinancialPlan from './pages/FinancialPlan';
import Budget from './pages/Budget';
import DCAStrategy from './pages/DCAStrategy';
import TaxCenter from './pages/TaxCenter';
import Liabilities from './pages/Liabilities';
import EstateSecurity from './pages/EstateSecurity';
import Landing from './pages/Landing';
import Goals from './pages/Goals';
import FeeAnalysis from './pages/FeeAnalysis';
import Pricing from './pages/Pricing';
import Scenarios from './pages/Scenarios';
import Features from './pages/Features';
import Settings from './pages/Settings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Performance": Performance,
    "FinancialPlan": FinancialPlan,
    "Budget": Budget,
    "DCAStrategy": DCAStrategy,
    "TaxCenter": TaxCenter,
    "Liabilities": Liabilities,
    "EstateSecurity": EstateSecurity,
    "Landing": Landing,
    "Goals": Goals,
    "FeeAnalysis": FeeAnalysis,
    "Pricing": Pricing,
    "Scenarios": Scenarios,
    "Features": Features,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};