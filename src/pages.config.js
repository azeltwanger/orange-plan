import Dashboard from './pages/Dashboard';
import Performance from './pages/Performance';
import FinancialPlan from './pages/FinancialPlan';
import Budget from './pages/Budget';
import DCAStrategy from './pages/DCAStrategy';
import TaxCenter from './pages/TaxCenter';
import Liabilities from './pages/Liabilities';
import EstateSecurity from './pages/EstateSecurity';
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
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};