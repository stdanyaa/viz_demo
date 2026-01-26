import { loadOccupancyData } from './loaders/occupancyLoader.js';
import { loadPointCloudData } from './loaders/pointCloudLoader.js';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return await res.json();
}

/**
 * Scene manifest schema (scene.json):
 * {
 *   "images": [{ "name": "...", "url": "images/ring_front_center.jpg" }, ...],
 *   "occupancy": { "url": "occ_frame000121.json" },
 *   "pointcloud": { "url": "vigt_frame000121.json" }
 * }
 */
export async function loadCompareScene(sceneJsonPath) {
  const sceneUrl = new URL(sceneJsonPath, window.location.href);
  const manifest = await fetchJson(sceneUrl.toString());

  const images = Array.isArray(manifest.images) ? manifest.images.map((it) => {
    const u = new URL(it.url, sceneUrl);
    return { name: it.name || it.url, url: u.toString() };
  }) : [];

  const occUrl = new URL(manifest?.occupancy?.url, sceneUrl).toString();
  const pcUrl = new URL(manifest?.pointcloud?.url, sceneUrl).toString();

  const [occupancy, pointcloud] = await Promise.all([
    loadOccupancyData(occUrl),
    loadPointCloudData(pcUrl),
  ]);

  return { manifest, images, occupancy, pointcloud };
}

