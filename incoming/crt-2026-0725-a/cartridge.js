(() => {
  const banner = document.querySelector('#result-banner');
  const buttons = [...document.querySelectorAll('[data-choice]')];
  const fallback = document.querySelector('#fallback');
  const outcomes = {
    A: { className: 'variant-a', title: 'Variant A — 재발견 인벤토리', quote: '“빈손이 아니었다. 손이 기억하지 못했을 뿐이다.”' },
    B: { className: 'variant-b', title: 'Variant B — 환대 수신기', quote: '“길 위의 도움은 빚이 아니라 방향 표식일 수 있다.”' },
    C: { className: 'variant-c', title: 'Variant C — 영원한 경유지', quote: '“너는 도착하지 않기 위해 계속 준비만 했다.”' }
  };
  let currentState = 'IDLE';

  function showOutcome(variant) {
    currentState = variant;
    const outcome = outcomes[variant];
    const strong = document.createElement('strong');
    strong.textContent = outcome.title;
    banner.className = `${outcome.className} visible`;
    banner.replaceChildren(strong, document.createElement('br'), document.createTextNode(outcome.quote));
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.choice === variant)));
  }
  buttons.forEach((button) => button.addEventListener('click', () => showOutcome(button.dataset.choice)));

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
