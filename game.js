import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import { PointerLockControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/PointerLockControls.js';

class Game {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.controls = new PointerLockControls(this.camera, document.body);
    
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.canJump = true;
    
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    
    this.prevTime = performance.now();
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.lastDelta = 1/60; // Store last good delta for pause/unpause

    this.raycaster = new THREE.Raycaster();
    this.heldCube = null;
    this.cubeHoldDistance = 3;
    
    this.cubes = [];  // Array to store all cubes for physics updates
    this.cubeVelocities = new Map();  // Map to store cube velocities
    
    this.shakeIntensity = 0;
    this.buildings = [];
    this.fallVelocityThreshold = -15; // Threshold for screen shake
    
    // Add new properties for fist mechanics
    this.fistModel = null;
    this.isPunching = false;
    this.punchAnimationTime = 0;
    this.punchDuration = 0.3; // seconds
    this.punchCooldown = false;
    this.lastPunchTime = 0;
    
    this.init();
  }

  init() {
    // Create gradient sky background
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;

    const uniforms = {
      topColor: { value: new THREE.Color(0x71c5ee) },    // Light blue
      bottomColor: { value: new THREE.Color(0xdcf5ff) }, // Very light blue
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };

    const skyGeo = new THREE.SphereGeometry(500, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: uniforms,
      side: THREE.BackSide
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
    
    // Rest of initialization
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Enhanced Lighting
    const ambientLight = new THREE.AmbientLight(0x606060); 
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 3, 2);
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 2, -1);
    
    this.scene.add(ambientLight);
    this.scene.add(directionalLight);
    this.scene.add(fillLight);

    // Floor with grid texture
    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    
    // Create grid texture with dark green lines
    const gridSize = 200;
    const gridDivisions = 100;
    const gridTexture = new THREE.GridHelper(gridSize, gridDivisions, 0x0a3a0a, 0x0a3a0a); 
    gridTexture.material.opacity = 0.4;
    gridTexture.material.transparent = true;
    gridTexture.position.y = 0.01;
    this.scene.add(gridTexture);

    // Floor material with darker grass-like appearance
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x184d18, 
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 1.0
    });
    
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Replace random cube spawning with physics-enabled cubes
    for (let i = 0; i < 50; i++) {
      const cube = this.spawnCube(
        Math.random() * 160 - 80, 
        Math.random() * 20 + 1,
        Math.random() * 160 - 80  
      );
      this.cubes.push(cube);
      this.cubeVelocities.set(cube, new THREE.Vector3(0, 0, 0));
    }

    // Create fist model
    this.createFistModel();

    // Add punch handler
    document.addEventListener('mousedown', (event) => this.onMouseDown(event));
    
    // Add buildings and props
    this.createBuildings();
    this.createProps();

    // Camera initial position
    this.camera.position.y = 2;

    // Event listeners
    document.addEventListener('click', (event) => this.onClick(event));
    document.addEventListener('contextmenu', (event) => this.onRightClick(event));
    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('resize', () => this.onWindowResize());

    // Start animation loop
    this.animate();
  }

  createFistModel() {
    const fistGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.6);
    const fistMaterial = new THREE.MeshStandardMaterial({ color: 0xffceb4 });
    this.fistModel = new THREE.Mesh(fistGeometry, fistMaterial);
    
    // Position the fist
    this.fistModel.position.set(0.4, -0.3, -0.8);
    this.camera.add(this.fistModel);
  }

  spawnCube(x, y, z) {
    const geometry = new THREE.BoxGeometry();
    
    // Brighter, more saturated colors
    const hue = Math.random();
    const saturation = 0.8; 
    const lightness = 0.6; 
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.4, 
      metalness: 0.1  
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(x, y, z);
    cube.userData.isPickable = true;
    this.scene.add(cube);
    this.cubes.push(cube);
    this.cubeVelocities.set(cube, new THREE.Vector3(0, 0, 0));
    return cube;
  }

  onClick(event) {
    if (!this.controls.isLocked) {
      this.controls.lock();
      return;
    }

    // Spawn cube with reduced initial velocity
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const spawnPosition = this.camera.position.clone().add(direction.multiplyScalar(3)); 
    const cube = this.spawnCube(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    const throwVelocity = direction.multiplyScalar(5); 
    this.cubeVelocities.get(cube).copy(throwVelocity);
  }

  onRightClick(event) {
    event.preventDefault();
    if (!this.controls.isLocked) return;

    if (this.heldCube) {
      // Throw the held cube in looking direction
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.heldCube.userData.isHeld = false;
      const throwVelocity = direction.multiplyScalar(5); 
      this.cubeVelocities.get(this.heldCube).copy(throwVelocity);
      this.heldCube = null;
    } else {
      // Try to pick up a cube
      const center = new THREE.Vector2();
      this.raycaster.setFromCamera(center, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children);
      
      for (const intersect of intersects) {
        if (intersect.object.userData.isPickable && !intersect.object.userData.isHeld) {
          this.heldCube = intersect.object;
          this.heldCube.userData.isHeld = true;
          this.cubeVelocities.get(this.heldCube).set(0, 0, 0);
          break;
        }
      }
    }
  }

  onMouseDown(event) {
    if (!this.controls.isLocked || this.punchCooldown) return;
    
    if (event.button === 0) { // Left click
      this.startPunch();
    }
  }

  startPunch() {
    const now = performance.now();
    if (now - this.lastPunchTime < 500) return; // 500ms cooldown
    
    this.isPunching = true;
    this.punchAnimationTime = 0;
    this.punchCooldown = true;
    this.lastPunchTime = now;
    
    // Punch raycast
    const center = new THREE.Vector2();
    this.raycaster.setFromCamera(center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cubes);
    
    if (intersects.length > 0 && intersects[0].distance < 4) {
      const hitCube = intersects[0].object;
      const hitPoint = intersects[0].point;
      
      // Create hole effect by scaling the cube
      const direction = hitPoint.clone().sub(hitCube.position).normalize();
      hitCube.scale.multiplyScalar(0.8);
      
      // Add force to the cube
      const punchForce = direction.multiplyScalar(10);
      this.cubeVelocities.get(hitCube).add(punchForce);
      
      // Screen shake on hit
      this.shakeIntensity = 0.2;
    }
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = true;
        break;
      case 'Space':
        if (this.canJump) {
          this.velocity.y += 20;
          this.canJump = false;
        }
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight = false;
        break;
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updatePosition() {
    const pos = this.camera.position;
    document.getElementById('position').textContent = 
      `X: ${pos.x.toFixed(2)} Y: ${pos.y.toFixed(2)} Z: ${pos.z.toFixed(2)}`;
  }

  updateFPS() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate > 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      document.getElementById('fps').textContent = fps;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  updateHeldCube() {
    if (this.heldCube) {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      const targetPosition = this.camera.position.clone()
        .add(direction.multiplyScalar(this.cubeHoldDistance));
      
      this.heldCube.position.lerp(targetPosition, 0.1);
    }
  }

  updateCubePhysics(delta) {
    const gravity = -9.8;
    const damping = 0.3; 
    const friction = 0.8; 
    const groundFriction = 0.7; 

    for (const cube of this.cubes) {
      if (cube.userData.isHeld) continue;

      const velocity = this.cubeVelocities.get(cube);
      
      // Apply gravity
      velocity.y += gravity * delta;
      
      // Update position
      cube.position.x += velocity.x * delta;
      cube.position.y += velocity.y * delta;
      cube.position.z += velocity.z * delta;
      
      // Floor collision with more friction
      if (cube.position.y < 0.5) {
        cube.position.y = 0.5;
        if (velocity.y < 0) {
          velocity.y = -velocity.y * damping;
          // Apply stronger ground friction
          velocity.x *= groundFriction;
          velocity.z *= groundFriction;
        }
      }
      
      // Cube collision with more friction
      for (const otherCube of this.cubes) {
        if (cube === otherCube) continue;
        
        const distance = cube.position.distanceTo(otherCube.position);
        if (distance < 1) {
          const normal = cube.position.clone().sub(otherCube.position).normalize();
          cube.position.add(normal.multiplyScalar(1 - distance));
          
          const dot = velocity.dot(normal);
          if (dot < 0) {
            velocity.sub(normal.multiplyScalar(2 * dot));
            velocity.multiplyScalar(damping);
            // Apply friction to lateral movement during collision
            const lateralVelocity = velocity.clone().sub(normal.multiplyScalar(velocity.dot(normal)));
            lateralVelocity.multiplyScalar(friction);
            velocity.copy(lateralVelocity.add(normal.multiplyScalar(velocity.dot(normal))));
          }
        }
      }
      
      // Additional velocity dampening for more stable stacking
      if (Math.abs(velocity.y) < 0.1 && cube.position.y <= 0.51) {
        velocity.x *= 0.92; 
        velocity.z *= 0.92;
      }
    }
  }

  createBuildings() {
    // Create several buildings with different sizes and positions
    const buildingConfigs = [
      { pos: [-40, 0, -40], size: [15, 30, 15], color: 0x808080 },
      { pos: [40, 0, -40], size: [20, 40, 20], color: 0x707070 },
      { pos: [-40, 0, 40], size: [25, 35, 25], color: 0x606060 },
      { pos: [40, 0, 40], size: [18, 25, 18], color: 0x909090 }
    ];

    buildingConfigs.forEach(config => {
      const geometry = new THREE.BoxGeometry(...config.size);
      const material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.7,
        metalness: 0.2
      });
      
      const building = new THREE.Mesh(geometry, material);
      building.position.set(...config.pos);
      building.position.y += config.size[1] / 2; // Move up by half height
      
      // Add windows
      this.addBuildingWindows(building, config.size);
      
      this.scene.add(building);
      this.buildings.push(building);
    });
  }

  addBuildingWindows(building, size) {
    const windowGeometry = new THREE.BoxGeometry(1, 1.5, 0.1);
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffaa,
      emissive: 0x555533,
      roughness: 0.2,
      metalness: 0.8
    });

    const windowSpacing = 3;
    const windowsPerSide = Math.floor(size[0] / windowSpacing);
    const windowRows = Math.floor(size[1] / windowSpacing);

    for (let side = 0; side < 4; side++) {
      for (let row = 1; row < windowRows; row++) {
        for (let i = 0; i < windowsPerSide; i++) {
          const window = new THREE.Mesh(windowGeometry, windowMaterial);
          const rotation = (side * Math.PI) / 2;
          
          window.position.y = row * windowSpacing - size[1] / 2;
          window.position.x = (i * windowSpacing - size[0] / 2 + windowSpacing/2) * Math.cos(rotation);
          window.position.z = (i * windowSpacing - size[0] / 2 + windowSpacing/2) * Math.sin(rotation);
          
          window.rotation.y = rotation;
          building.add(window);
        }
      }
    }
  }

  createProps() {
    // Create benches
    const benchPositions = [
      [-10, 0, -10],
      [10, 0, 10],
      [-20, 0, 20],
      [20, 0, -20]
    ];

    benchPositions.forEach(pos => {
      this.createBench(...pos);
    });

    // Create trees
    const treePositions = [
      [-15, 0, -15],
      [15, 0, 15],
      [-25, 0, 25],
      [25, 0, -25]
    ];

    treePositions.forEach(pos => {
      this.createTree(...pos);
    });
  }

  createBench(x, y, z) {
    const benchGroup = new THREE.Group();
    
    // Seat
    const seatGeometry = new THREE.BoxGeometry(3, 0.2, 1);
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x4d2926 });
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.y = 0.6;
    
    // Legs
    const legGeometry = new THREE.BoxGeometry(0.2, 1.2, 1);
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    const leg1 = new THREE.Mesh(legGeometry, legMaterial);
    leg1.position.set(-1.3, 0.6, 0);
    
    const leg2 = new THREE.Mesh(legGeometry, legMaterial);
    leg2.position.set(1.3, 0.6, 0);
    
    benchGroup.add(seat, leg1, leg2);
    benchGroup.position.set(x, y, z);
    this.scene.add(benchGroup);
  }

  createTree(x, y, z) {
    const treeGroup = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 3, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4d2926 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.5;
    
    // Leaves
    const leavesGeometry = new THREE.ConeGeometry(2, 4, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x0f5f0f });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 4;
    
    treeGroup.add(trunk, leaves);
    treeGroup.position.set(x, y, z);
    this.scene.add(treeGroup);
  }

  applyScreenShake() {
    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.9; // Decay the shake
      
      if (this.shakeIntensity < 0.01) {
        this.shakeIntensity = 0;
      }
    }
  }

  updateFistAnimation(delta) {
    if (!this.isPunching) {
      // Idle animation
      this.fistModel.position.y = -0.3 + Math.sin(performance.now() * 0.002) * 0.02;
      return;
    }
    
    this.punchAnimationTime += delta;
    const progress = this.punchAnimationTime / this.punchDuration;
    
    if (progress < 0.5) {
      // Forward punch
      const punchProgress = progress * 2;
      this.fistModel.position.z = -0.8 - punchProgress * 0.5;
      this.fistModel.rotation.x = punchProgress * Math.PI * 0.1;
    } else {
      // Retract
      const retractProgress = (progress - 0.5) * 2;
      this.fistModel.position.z = -1.3 + retractProgress * 0.5;
      this.fistModel.rotation.x = Math.PI * 0.1 - retractProgress * Math.PI * 0.1;
    }
    
    if (progress >= 1) {
      this.isPunching = false;
      this.fistModel.position.set(0.4, -0.3, -0.8);
      this.fistModel.rotation.set(0, 0, 0);
      setTimeout(() => this.punchCooldown = false, 100);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls.isLocked) {
      const time = performance.now();
      let delta = (time - this.prevTime) / 1000;
      
      // Prevent huge physics steps after unpause
      if (delta > 0.1) {
        delta = this.lastDelta;
      }
      this.lastDelta = delta;

      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;
      this.velocity.y -= 9.8 * 10.0 * delta;

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      if (this.moveForward || this.moveBackward) {
        this.velocity.z -= this.direction.z * 400.0 * delta;
      }
      if (this.moveLeft || this.moveRight) {
        this.velocity.x -= this.direction.x * 400.0 * delta;
      }

      this.controls.moveRight(-this.velocity.x * delta);
      this.controls.moveForward(-this.velocity.z * delta);

      this.camera.position.y += this.velocity.y * delta;

      if (this.camera.position.y < 2) {
        this.velocity.y = 0;
        this.camera.position.y = 2;
        this.canJump = true;
      }

      // Update cube physics with capped delta
      this.updateCubePhysics(Math.min(delta, 0.1));

      // Check fall velocity for screen shake
      if (this.velocity.y < this.fallVelocityThreshold) {
        this.shakeIntensity = Math.abs(this.velocity.y) * 0.03;
      }
      
      // Apply screen shake
      this.applyScreenShake();

      this.updatePosition();
      this.updateHeldCube();
      this.updateFistAnimation(delta);
      this.prevTime = time;
    } else {
      // When paused, just update the previous time without processing physics
      this.prevTime = performance.now();
    }

    this.updateFPS();
    this.renderer.render(this.scene, this.camera);
  }
  
  // Start the game
}
new Game();