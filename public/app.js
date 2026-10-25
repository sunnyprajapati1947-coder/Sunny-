'use strict';

const form = document.querySelector('#auth-form');
const button = document.querySelector('#submit-button');
const label = button.querySelector('.button-label');
const feedback = document.querySelector('#feedback');

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.className = `feedback show ${type}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedback.className = 'feedback';

  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  button.classList.add('loading');
  label.textContent = 'Deploying…';

  try {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(result.message || 'Deployment failed. Try again.');

    showFeedback(result.message, 'success');
    form.reset();
  } catch (error) {
    showFeedback(error.message || 'Network error. Check your connection and try again.', 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
    label.textContent = 'Enter battlefield';
  }
});
