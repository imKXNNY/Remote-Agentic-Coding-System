<script lang="ts">
  import { API } from '../lib/api';

  let username = '';
  let password = '';
  let error = '';

  async function login() {
    API.setCredentials(username, password);
    try {
      error = '';
      // Test credentials
      const res = await API.fetch('/api/conversations');
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        error = `Login failed (${res.status}): ${data.error || res.statusText}`;
      }
    } catch (e: any) {
      error = e.message || 'Connection failed';
    }
  }
</script>

<div class="login-page">
  <div class="login-card glass shadow">
    <div class="header">
      <div class="logo">🛰️</div>
      <h1>Remote Agent</h1>
      <p>Enter your credentials to manage your workspace</p>
    </div>

    <form on:submit|preventDefault={login}>
      <div class="field">
        <label for="user">Username</label>
        <div class="input-wrapper">
          <input id="user" type="text" bind:value={username} placeholder="admin" required />
        </div>
      </div>

      <div class="field">
        <label for="pass">Password</label>
        <div class="input-wrapper">
          <input id="pass" type="password" bind:value={password} placeholder="••••••••" required />
        </div>
      </div>

      {#if error}
        <div class="error-box">
          <span class="error-icon">⚠️</span>
          <p class="error-msg">{error}</p>
        </div>
      {/if}

      <button type="submit" class="login-btn"> Sign In </button>
    </form>

    <div class="footer">Powered by Antigravity OS</div>
  </div>
</div>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    width: 100vw;
    background: radial-gradient(circle at top right, #1a3a5a, #121212);
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    padding: 2.5rem;
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .shadow {
    box-shadow: var(--shadow-lg);
  }

  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }

  .logo {
    font-size: 3rem;
  }

  h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    background: linear-gradient(to right, #fff, #999);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .input-wrapper {
    position: relative;
  }

  input {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: white;
    font-size: 1rem;
    transition: var(--transition-fast);
  }

  input:focus {
    outline: none;
    border-color: var(--accent-blue);
    background: rgba(255, 255, 255, 0.08);
  }

  .error-box {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(244, 135, 113, 0.1);
    border: 1px solid var(--error-red);
    border-radius: var(--radius-sm);
  }

  .error-msg {
    color: var(--error-red);
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .login-btn {
    margin-top: 0.5rem;
    padding: 0.8rem;
    background: var(--accent-blue);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .login-btn:hover {
    background: var(--accent-blue-hover);
    transform: translateY(-1px);
  }

  .login-btn:active {
    transform: translateY(0);
  }

  .footer {
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.5;
  }
</style>
