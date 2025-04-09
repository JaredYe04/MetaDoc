import { reactive } from "vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
// theme.js
export const lightTheme = {
  name: 'light',
  AiLogo: AiLogo,
    background: '#ffffff',
    background2nd: '#f5f5f5',
    textColor: '#000000',
    textColor2: '#000000',
    headerBackground: '#f5f5f5',
    sidebarBackground: '#f0f0f0',
    sidebarBackground2: '#f0f0f0',
    SideBackgroundColor:"#FEFEFE",
    SideTextColor:'#000000',
    SideTextColor2:'#000000',
    SideActiveTextColor:'#000000',
    vditorTheme: 'classic',
    codeTheme: 'github',
    titleMenuBackground:'#0066FF44',
    outlineBackground:'#4c78a8',
    outlineNode : '#9ecae9',
    quickStartBackground1:'#ADD8E61A',
    quickStartBackground2:'#D6D6FF44',
    mdeditorClass:'md-editor',
  };
  
export const darkTheme = {
  name: 'dark',
  AiLogo: AiLogoWhite,
    background: '#2c2c2c',
    background2nd: '#3a3a3a',
    textColor: '#ffffff',
    textColor2: '#dddddd',
    headerBackground: '#3a3a3a',
    sidebarBackground: '#1e1e1e',
    sidebarBackground2: '#2e2e2e',
    SideBackgroundColor:"#545c64",
    SideTextColor:"#fff",
    SideActiveTextColor:"#ffd04b",
    SideTextColor2:"#ffd0ee",
    vditorTheme: 'dark',
    codeTheme: 'a11y-dark',
    titleMenuBackground:'#111111AA',
    outlineBackground:'#bab0ac',
    outlineNode : '#79706e',
    quickStartBackground1:'#66333311',
    quickStartBackground2:'#33336611',
    mdeditorClass:'md-editor-dark',
  };
  




export const themeState=reactive({
    currentTheme:darkTheme
})