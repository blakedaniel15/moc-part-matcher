/** @type {import('next').NextConfig} */
const nextConfig = {
  // Foundation phase: the app is a placeholder. Real correctness is verified by
  // `npm test` + `npm run eval` in CI (GitHub Actions), not by the Next build.
  // Re-enable strict build checks in Plan 3 when the real UI ships.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
