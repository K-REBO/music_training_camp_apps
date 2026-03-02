{
  description = "Music Training Camp Apps - Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true; # Playwrightなどのために必要
        };

        # Playwright用の環境変数
        playwrightEnv = {
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js環境
            nodejs_22
            pnpm

            # Deno
            deno

            # Playwright & ブラウザ
            playwright-driver.browsers

            # 追加の開発ツール
            git

            # Playwrightの依存関係
            # これらはPlaywrightがFirefoxを実行するために必要
            at-spi2-atk
            cups
            dbus
            glib
            gtk3
            libdrm
            libxkbcommon
            mesa
            nspr
            nss
            pango
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxcb
            alsa-lib
            libpulseaudio
          ];

          shellHook = ''
            echo "🎵 Music Training Camp Apps - Development Environment"
            echo ""
            echo "Available tools:"
            echo "  - Node.js: $(node --version)"
            echo "  - pnpm: $(pnpm --version)"
            echo "  - Deno: $(deno --version | head -n1)"
            echo "  - Playwright browsers: Firefox"
            echo ""
            echo "Environment variables:"
            echo "  PLAYWRIGHT_BROWSERS_PATH=${playwrightEnv.PLAYWRIGHT_BROWSERS_PATH}"
            echo ""
            echo "Quick start:"
            echo "  cd reservation && pnpm install && pnpm dev"
            echo "  cd studio-assignment && pnpm install && pnpm dev"
            echo ""

            # Playwright環境変数の設定
            export PLAYWRIGHT_BROWSERS_PATH="${playwrightEnv.PLAYWRIGHT_BROWSERS_PATH}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS="true"

            # pnpmのストアディレクトリを設定（オプション）
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"
          '';

          # Playwrightが必要とする共有ライブラリのパス
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (with pkgs; [
            at-spi2-atk
            cups
            dbus
            glib
            gtk3
            libdrm
            libxkbcommon
            mesa
            nspr
            nss
            pango
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxcb
            alsa-lib
            libpulseaudio
          ]);
        };
      }
    );
}
