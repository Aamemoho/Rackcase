(() => {
  const CARTRIDGE_ID = 'crt-2026-0725-a';
  const SOLO_KEY = `rack:solo:${CARTRIDGE_ID}`;

  const banner = document.querySelector('#result-banner');
  const buttons = [...document.querySelectorAll('[data-choice]')];
  const fallback = document.querySelector('#fallback');
  const notice = document.querySelector('#seal-notice');

  const outcomes = {
    A: { className: 'variant-a', title: 'Variant A \u2014 \uc7ac\ubc1c\uacac \uc778\ubca4\ud1a0\ub9ac', quote: '\u201c\ube48\uc190\uc774 \uc544\ub2c8\uc5c8\ub2e4. \uc190\uc774 \uae30\uc5b5\ud558\uc9c0 \ubabb\ud588\uc744 \ubfd0\uc774\ub2e4.\u201d' },
    B: { className: 'variant-b', title: 'Variant B \u2014 \ud658\ub300 \uc218\uc2e0\uae30', quote: '\u201c\uae38 \uc704\uc758 \ub3c4\uc6c0\uc740 \ube5a\uc774 \uc544\ub2c8\ub77c \ubc29\ud5a5 \ud45c\uc2dd\uc77c \uc218 \uc788\ub2e4.\u201d' },
    C: { className: 'variant-c', title: 'Variant C \u2014 \uc601\uc6d0\ud55c \uacbd\uc720\uc9c0', quote: '\u201c\ub108\ub294 \ub3c4\ucc29\ud558\uc9c0 \uc54a\uae30 \uc704\ud574 \uacc4\uc18d \uc900\ube44\ub9cc \ud588\ub2e4.\u201d' }
  };

  const embedded = window.parent !== window;

  const solo = {
    get() { try { return localStorage.getItem(SOLO_KEY); } catch { return null; } },
    set(value) { try { localStorage.setItem(SOLO_KEY, value); } catch { /* noop */ } },
    clear() { try { localStorage.removeItem(SOLO_KEY); } catch { /* noop */ } }
  };

  if (new URLSearchParams(location.search).has('reset')) {
    solo.clear();
    location.replace(location.pathname);
    return;
  }

  let currentState = 'IDLE';
  let sealed = false;
  let settleNow = null;

  function seal(variant, { restored = false } = {}) {
    if (sealed || !outcomes[variant]) return;
    sealed = true;
    currentState = variant;

    const outcome = outcomes[variant];
    const strong = document.createElement('strong');
    strong.textContent = outcome.title;
    banner.className = `${outcome.className} visible`;
    banner.replaceChildren(strong, document.createElement('br'), document.createTextNode(outcome.quote));

    for (const button of buttons) {
      const taken = button.dataset.choice === variant;
      button.setAttribute('aria-pressed', String(taken));
      button.disabled = true;
      button.classList.add(taken ? 'is-taken' : 'is-sealed');
    }

    if (notice) notice.textContent = '\uc774 \uc120\ud0dd\uc740 \ub0a8\uc558\uc2b5\ub2c8\ub2e4. \ub2e4\ub978 \ub458\uc740 \uc5f4\ub9ac\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.';
    if (restored && settleNow) settleNow();
  }

  function choose(variant) {
    if (sealed || !outcomes[variant]) return;
    if (embedded) {
      window.parent.postMessage({ type: 'rack:spend', id: CARTRIDGE_ID, choice: variant }, '*');
      return;
    }
    solo.set(variant);
    seal(variant);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => choose(button.dataset.choice));
  }

  if (embedded) {
    addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.id !== CARTRIDGE_ID) return;
      if ((data.type === 'rack:state' || data.type === 'rack:ack') && data.choice) {
        seal(data.choice, { restored: data.type === 'rack:state' });
      }
    });
    window.parent.postMessage({ type: 'rack:hello', id: CARTRIDGE_ID }, '*');
  } else {
    const restored = solo.get();
    if (restored) seal(restored, { restored: true });
  }

  if (!globalThis.THREE) {
    fallback.hidden = false;
    console.error('Three.js failed to load');
    return;
  }

  try {
    const container = document.querySelector('#canvas-container');
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.18);

    const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 4.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const mainLight = new THREE.PointLight(0x00e5ff, 2, 8);
    mainLight.position.set(2, 3, 2);
    scene.add(mainLight);
    const subLight = new THREE.PointLight(0xff4b4b, 1.2, 8);
    subLight.position.set(-2, -2, -1);
    scene.add(subLight);

    const cartridgeGroup = new THREE.Group();
    scene.add(cartridgeGroup);
    const glassGeo = new THREE.BoxGeometry(1.2, 1.8, 0.35);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x88aaff, transparent: true, opacity: .35, roughness: .1, metalness: .1, transmission: .85, ior: 1.4, side: THREE.DoubleSide });
    cartridgeGroup.add(new THREE.Mesh(glassGeo, glassMat));
    cartridgeGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .25 })));

    const particlesGroup = new THREE.Group();
    const particleGeo = new THREE.SphereGeometry(.025, 8, 8);
    const particleMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: .3 });
    const particles = [];
    for (let i = 0; i < 20; i += 1) {
      const mesh = new THREE.Mesh(particleGeo, particleMat);
      mesh.position.set((Math.random() - .5) * .9, (Math.random() - .5) * 1.4, (Math.random() - .5) * .2);
      particlesGroup.add(mesh);
      particles.push({ mesh, vel: new THREE.Vector3((Math.random() - .5) * .004, (Math.random() - .5) * .004, (Math.random() - .5) * .002) });
    }
    cartridgeGroup.add(particlesGroup);

    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x00e5ff, transmission: .9, roughness: .05, ior: 1.33, transparent: true, opacity: 0 });
    const dropMesh = new THREE.Mesh(new THREE.SphereGeometry(.22, 32, 32), dropMat);
    dropMesh.scale.set(.01, .01, .01);
    cartridgeGroup.add(dropMesh);

    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff4b4b, wireframe: true, transparent: true, opacity: 0 });
    const crackMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 1), crackMat);
    cartridgeGroup.add(crackMesh);
    const fullScale = new THREE.Vector3(1, 1, 1);
    const tinyScale = new THREE.Vector3(.01, .01, .01);
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 다시 찾아온 방문자에게는 결과가 '지금 일어나는 일'이 아니라
    // '이미 일어난 일'이어야 하므로, 전이 없이 최종 상태로 앉힌다.
    settleNow = function settle() {
      if (currentState === 'A' || currentState === 'B') {
        const color = currentState === 'A' ? 0x00e5ff : 0xffd700;
        dropMat.opacity = 1;
        dropMesh.scale.copy(fullScale);
        dropMat.color.setHex(color);
        glassMat.color.setHex(color);
        crackMat.opacity = 0;
      } else if (currentState === 'C') {
        crackMat.opacity = .95;
        dropMat.opacity = 0;
        dropMesh.scale.copy(tinyScale);
        glassMat.color.setHex(0xff4b4b);
      }
    };
    if (sealed) settleNow();

    function animate(time = 0) {
      requestAnimationFrame(animate);
      cartridgeGroup.rotation.y += reduceMotion ? .001 : .006;
      cartridgeGroup.rotation.x = Math.sin(time * .001) * (reduceMotion ? .02 : .08);
      for (const particle of particles) {
        particle.mesh.position.add(particle.vel);
        if (Math.abs(particle.mesh.position.x) > .45) particle.vel.x *= -1;
        if (Math.abs(particle.mesh.position.y) > .75) particle.vel.y *= -1;
        if (Math.abs(particle.mesh.position.z) > .12) particle.vel.z *= -1;
      }
      if (currentState === 'A' || currentState === 'B') {
        dropMat.opacity = THREE.MathUtils.lerp(dropMat.opacity, 1, .08);
        dropMesh.scale.lerp(fullScale, .08);
        dropMesh.rotation.y += .01;
        const color = currentState === 'A' ? 0x00e5ff : 0xffd700;
        dropMat.color.setHex(color);
        glassMat.color.setHex(color);
        crackMat.opacity = THREE.MathUtils.lerp(crackMat.opacity, 0, .1);
      } else if (currentState === 'C') {
        crackMat.opacity = THREE.MathUtils.lerp(crackMat.opacity, .95, .08);
        crackMesh.rotation.x += .015;
        crackMesh.rotation.y += .015;
        dropMat.opacity = THREE.MathUtils.lerp(dropMat.opacity, 0, .1);
        dropMesh.scale.lerp(tinyScale, .1);
        glassMat.color.setHex(0xff4b4b);
      }
      renderer.render(scene, camera);
    }
    animate();

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    });
  } catch (error) {
    fallback.hidden = false;
    console.error(error);
  }
})();
