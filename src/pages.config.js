/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
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