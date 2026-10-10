import test from 'node:test';
import assert from 'node:assert/strict';
import { HeroTypeReveal, TYPE_REVEAL_MS, scanFrames } from '../src/hero-type-reveal.js';
import { headline } from '../src/diorama-timeline.js';

function fixture({ reduced = false, animations = true } = {}) {
  const pending = [];
  const createNode = () => ({ textContent: '', dataset: {}, attributes: {}, children: [],
    classList: { add() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    replaceChildren(...children) { this.children = children; },
    animate: animations ? (frames, options) => {
      let resolve;
      const animation = { frames, options, cancelled: false,
        finished: new Promise(done => { resolve = done; }),
        cancel() { this.cancelled = true; }, finish() { resolve(); } };
      pending.push(animation);
      return animation;
    } : undefined
  });
  const heading = createNode();
  heading.textContent = 'The shape of a day.';
  heading.ownerDocument = { createElement: createNode };
  const state = { reduced };
  const reveal = new HeroTypeReveal(heading, { reducedMotion: () => state.reduced });
  return { heading, reveal, state, pending };
}

test('hero copy is concise and distinct for each architectural state', () => {
  const states = [0, 1].flatMap(space => [0, .5, 1].map(local => headline(space, local)));
  assert.equal(new Set(states.map(state => state[1])).size, 6);
  for (const [label, title, deck] of states) {
    assert.ok(label.length < 25);
    assert.ok(title.length < 25);
    assert.ok(deck.length < 30);
    assert.doesNotMatch(title, /From structure|Made yours|Ready for living/i);
  }
});

test('a shared scan boundary replaces a whole headline, not individual particle nodes', async () => {
  const { heading, reveal, pending } = fixture();
  assert.equal(heading.children.length, 3);
  assert.equal(heading.attributes['aria-label'], 'The shape of a day.');
  reveal.show('Life, taking form.');
  assert.equal(heading.dataset.typeState, 'scanning');
  assert.equal(pending.length, 3);
  assert.equal(heading.children[0].textContent, 'The shape of a day.');
  assert.equal(heading.children[1].textContent, 'Life, taking form.');
  assert.equal(heading.attributes['aria-label'], 'Life, taking form.');
  for (const layer of heading.children) assert.equal(layer.attributes['aria-hidden'], 'true');
  for (const animation of pending) assert.equal(animation.options.duration, TYPE_REVEAL_MS);
  assert.ok(TYPE_REVEAL_MS < 800);
  assert.equal(scanFrames('incoming')[0].clipPath, 'inset(0 100% 0 0%)');
  assert.equal(scanFrames('outgoing')[1].clipPath, 'inset(0 0% 0 100%)');
  pending[1].finish();
  await Promise.resolve();
  assert.equal(heading.dataset.typeState, 'still');
  assert.deepEqual(heading.children.map(node => node.textContent), ['', 'Life, taking form.', '']);
  reveal.show('Life, taking form.');
  assert.equal(pending.length, 3, 'the render loop must not restart an unchanged headline');
});

test('superseded and disposed scans cannot settle over a newer headline', async () => {
  const { heading, reveal, pending } = fixture();
  reveal.show('Life, taking form.');
  reveal.show('Time finds a place.');
  pending[1].finish();
  await Promise.resolve();
  assert.equal(heading.dataset.typeState, 'scanning');
  assert.equal(heading.attributes['aria-label'], 'Time finds a place.');
  reveal.dispose();
  pending[4].finish();
  await Promise.resolve();
  reveal.show('Should not replace disposed text');
  assert.equal(heading.dataset.typeState, 'still');
  assert.equal(heading.children[1].textContent, 'Time finds a place.');
  assert.ok(pending.every(animation => animation.cancelled));
});

test('reduced motion settles immediately, including a preference changed mid-scan', () => {
  const { heading, reveal, state, pending } = fixture();
  reveal.show('Life, taking form.');
  state.reduced = true;
  reveal.show('Life, taking form.');
  assert.equal(heading.dataset.typeState, 'still');
  reveal.show('Time finds a place.');
  assert.equal(heading.children[1].textContent, 'Time finds a place.');
  assert.equal(pending.length, 3);
  const fallback = fixture({ animations: false });
  fallback.reveal.show('Room for stillness.');
  assert.equal(fallback.heading.dataset.typeState, 'still');
  assert.equal(fallback.heading.attributes['aria-label'], 'Room for stillness.');
});
