<template>
  <div id="particle-bg" class="homepage">
    <div class="center-content">
      <h1 class="main-letter" @mouseover="highlightM" @mouseleave="resetM">MetaDoc</h1>
      <div class="buttons aero-div">
          <el-button type="primary" @click="quickStart" class="aero-btn">快速开始</el-button>
          <el-button type="success" @click="openFile" class="aero-btn">打开文件</el-button>
        </div>
    </div>
  </div>
</template>

<script>
import { ElButton } from 'element-plus'
import * as THREE from 'three'
import "../assets/aero-div.css"
import "../assets/aero-btn.css"
export default {
  components: {
    ElButton,
  },
  data() {
    return {
      mouseX: 0,
      mouseY: 0,
    }
  },
  mounted() {
    this.initThreeJS();
    this.animate(); // 开始动画循环
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('resize', this.onWindowResize); // 添加窗口大小变化事件
  },
  beforeDestroy() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer) this.renderer.dispose();
  },
  methods: {
    // 定义Three.js对象为组件的属性
    scene: null,
    camera: null,
    renderer: null,
    particles: null,
    initThreeJS() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
      this.camera.position.z = 800;

      // 设置渲染器
      this.renderer = new THREE.WebGLRenderer({ alpha: true });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.top = '0';
      this.renderer.domElement.style.left = '0';
      this.renderer.domElement.style.zIndex = '-1'; // 置于底层

      document.getElementById('particle-bg').appendChild(this.renderer.domElement);

      const particleCount = 100;
      const particles = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 1500;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 1500;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 1500;

        colors[i * 3] = Math.random();
        colors[i * 3 + 1] = Math.random();
        colors[i * 3 + 2] = Math.random();
      }

      particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 50,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
      });

      this.particles = new THREE.Points(particles, material);
      this.scene.add(this.particles);
    },
    animate() {
      requestAnimationFrame(this.animate); // 递归调用

      // 让粒子微微旋转，制造动态效果
      this.particles.rotation.x += 0.001;
      this.particles.rotation.y += 0.001;

      // 根据鼠标位置调整粒子旋转
      this.particles.rotation.x += (this.mouseY / window.innerHeight) * 0.1;
      this.particles.rotation.y += (this.mouseX / window.innerWidth) * 0.1;

      // 渲染场景
      this.renderer.render(this.scene, this.camera);
    },
    onMouseMove(event) {
      this.mouseX = (event.clientX - window.innerWidth / 2) * 0.1;
      this.mouseY = (event.clientY - window.innerHeight / 2) * 0.1;
    },
    onWindowResize() {
      // 当窗口大小改变时更新相机和渲染器
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    quickStart() {
      // 快速开始按钮逻辑
    },
    openFile() {
      // 打开文件按钮逻辑
    },
    highlightM() {
      document.querySelector('.main-letter').style.color = 'rgb(50, 150, 250)';
    },
    resetM() {
      document.querySelector('.main-letter').style.color = 'rgb(149, 149, 149)';
    },
  }
}
</script>

<style scoped>
.homepage {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.center-content {
  display: flex;
  flex-direction: column; /* 垂直排列 */
  align-items: center; /* 水平居中 */
  /* justify-content: center; 垂直居中 */
  height: 100vh; /* 占满整个视口高度 */
  text-align: center;
}

.main-letter {
  font-size: 70px;
  font-weight: bold;
  color: rgb(149, 149, 149);
  transition: color 0.3s ease;
  background-color: rgba(0, 0, 0, 0);
}

.buttons {
  margin-top: 20px;
  width: fit-content;
  margin: 50px;
  padding: 30px;
  align-items: center;
  justify-content: center;
  align-self: center;
}

.buttons .el-button {
  margin: 0 10px;
}
</style>
