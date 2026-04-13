// frontend/src/components/DNABackground.jsx
// Three.js animated 3D DNA strand + blockchain nodes — sits behind all content
import { useEffect, useRef } from 'react';

export default function DNABackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    let animId;
    let THREE;
    let renderer, scene, camera, clock;
    let helixGroup, hexGroup;

    const TEAL   = 0x00c896;
    const MINT   = 0xe8f5f0;
    const TEAL2  = 0x00a87e;

    function buildScene(T) {
      scene    = new T.Scene();
      clock    = new T.Clock();

      // Camera
      camera   = new T.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
      camera.position.set(0, 0, 22);

      // Renderer
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 0);
      mountRef.current.appendChild(renderer.domElement);

      // ── DNA Double Helix ──────────────────────────────────────
      helixGroup = new T.Group();
      scene.add(helixGroup);

      const nodeCount  = 40;
      const helixH     = 20;
      const helixR     = 2.2;
      const pitch      = (Math.PI * 2) / nodeCount * 5; // 5 full turns

      const sphereGeo  = new T.SphereGeometry(0.18, 8, 8);
      const connGeo    = new T.SphereGeometry(0.08, 6, 6);

      for (let i = 0; i < nodeCount; i++) {
        const t   = i / (nodeCount - 1);
        const y   = helixH * (t - 0.5);
        const ang = i * pitch;

        // Strand A (teal)
        const matA  = new T.MeshBasicMaterial({ color: i % 3 === 0 ? TEAL : TEAL2 });
        const sA    = new T.Mesh(sphereGeo, matA);
        sA.position.set(Math.cos(ang) * helixR, y, Math.sin(ang) * helixR);
        helixGroup.add(sA);

        // Strand B (mint-white), π offset
        const matB  = new T.MeshBasicMaterial({ color: MINT });
        const sB    = new T.Mesh(sphereGeo, matB);
        sB.position.set(Math.cos(ang + Math.PI) * helixR, y, Math.sin(ang + Math.PI) * helixR);
        helixGroup.add(sB);

        // Connect rungs every 2 nodes
        if (i % 2 === 0) {
          const matConn = new T.MeshBasicMaterial({ color: 0xaaddd4, transparent: true, opacity: 0.45 });
          const steps   = 5;
          for (let s = 0; s <= steps; s++) {
            const lp = s / steps;
            const cx = sA.position.x + (sB.position.x - sA.position.x) * lp;
            const cz = sA.position.z + (sB.position.z - sA.position.z) * lp;
            const rc = new T.Mesh(connGeo, matConn);
            rc.position.set(cx, y, cz);
            helixGroup.add(rc);
          }
        }
      }

      // ── Blockchain Hexagons ───────────────────────────────────
      hexGroup = new T.Group();
      scene.add(hexGroup);

      function hexShape(r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          pts.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r));
        }
        pts.push(pts[0].clone());
        return pts;
      }

      const hexCount = 10;
      for (let i = 0; i < hexCount; i++) {
        const pts    = hexShape(1.4 + Math.random() * 0.8);
        const path   = new T.BufferGeometry().setFromPoints(
          pts.map(p => new T.Vector3(p.x, p.y, 0))
        );
        const mat    = new T.LineBasicMaterial({
          color: TEAL,
          transparent: true,
          opacity: 0.12 + Math.random() * 0.10,
        });
        const hex    = new T.Line(path, mat);
        hex.position.set(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 22,
          -8 - Math.random() * 8,
        );
        hex.rotation.z = Math.random() * Math.PI;
        hex.userData.floatSpeed = 0.18 + Math.random() * 0.12;
        hex.userData.floatAmp   = 0.5 + Math.random() * 0.8;
        hex.userData.offset     = Math.random() * Math.PI * 2;
        hexGroup.add(hex);
      }
    }

    function animate() {
      animId = requestAnimationFrame(animate);
      if (!clock) return;
      const t = clock.getElapsedTime();

      // Slowly rotate helix
      if (helixGroup) {
        helixGroup.rotation.y = t * 0.18;
        helixGroup.rotation.x = Math.sin(t * 0.07) * 0.12;
      }

      // Float hexagons
      if (hexGroup) {
        hexGroup.children.forEach(h => {
          h.position.y += Math.sin(t * h.userData.floatSpeed + h.userData.offset) * 0.003;
          h.rotation.z  += 0.0008;
        });
      }

      renderer.render(scene, camera);
    }

    function onResize() {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Load Three.js from CDN then build scene
    const existing = document.getElementById('three-cdn');
    if (existing) {
      THREE = window.THREE;
      if (THREE) { buildScene(THREE); animate(); }
    } else {
      const script  = document.createElement('script');
      script.id     = 'three-cdn';
      script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => {
        THREE = window.THREE;
        buildScene(THREE);
        animate();
      };
      document.head.appendChild(script);
    }

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      if (renderer && mountRef.current) {
        try { mountRef.current.removeChild(renderer.domElement); } catch (_) {}
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        opacity: 0.22,
        pointerEvents: 'none',
      }}
    />
  );
}
