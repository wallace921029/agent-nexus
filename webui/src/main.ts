import { createApp } from 'vue';
import App from './App.vue';
import { applyTheme } from './lib/theme';
import './style.css';

applyTheme();
createApp(App).mount('#app');
