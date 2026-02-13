[Skip to content](https://github.com/daytonaio/daytona/blob/main/images/sandbox/Dockerfile#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/daytonaio/daytona/blob/main/images/sandbox/Dockerfile) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/daytonaio/daytona/blob/main/images/sandbox/Dockerfile) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/daytonaio/daytona/blob/main/images/sandbox/Dockerfile) to refresh your session.Dismiss alert

{{ message }}

[daytonaio](https://github.com/daytonaio)/ **[daytona](https://github.com/daytonaio/daytona)** Public

- [Notifications](https://github.com/login?return_to=%2Fdaytonaio%2Fdaytona) You must be signed in to change notification settings
- [Fork\\
5k](https://github.com/login?return_to=%2Fdaytonaio%2Fdaytona)
- [Star\\
55.2k](https://github.com/login?return_to=%2Fdaytonaio%2Fdaytona)


## Collapse file tree

## Files

main

Search this repository

/

# Dockerfile

Copy path

BlameMore file actions

BlameMore file actions

## Latest commit

[![brunogrbavac](https://avatars.githubusercontent.com/u/33067062?v=4&size=40)](https://github.com/brunogrbavac)[brunogrbavac](https://github.com/daytonaio/daytona/commits?author=brunogrbavac)

[chore(sandbox-image): default image workflow and add bun, claude agen…](https://github.com/daytonaio/daytona/commit/1147a4e4a2de93f0e3511aef0291df571408eb8b)

Open commit detailsfailure

5 days agoFeb 6, 2026

[1147a4e](https://github.com/daytonaio/daytona/commit/1147a4e4a2de93f0e3511aef0291df571408eb8b) · 5 days agoFeb 6, 2026

## History

[History](https://github.com/daytonaio/daytona/commits/main/images/sandbox/Dockerfile)

Open commit details

[View commit history for this file.](https://github.com/daytonaio/daytona/commits/main/images/sandbox/Dockerfile) History

95 lines (83 loc) · 2.5 KB

/

# Dockerfile

Top

## File metadata and controls

- Code

- Blame


95 lines (83 loc) · 2.5 KB

[Raw](https://github.com/daytonaio/daytona/raw/refs/heads/main/images/sandbox/Dockerfile)

Copy raw file

Download raw file

Open symbols panel

Edit and raw actions

1

2

3

4

5

6

7

8

9

10

11

12

13

14

15

16

17

18

19

20

21

22

23

24

25

26

27

28

29

30

31

32

33

34

35

36

37

38

39

40

41

42

43

44

45

46

47

48

49

50

51

52

53

54

55

56

57

58

59

60

61

62

63

64

65

66

67

68

69

70

71

72

73

74

75

76

77

78

79

80

81

82

83

84

85

86

87

88

89

90

91

92

93

94

95

FROM mcr.microsoft.com/devcontainers/python:3.14

# Update package list and install required dependencies

RUN apt-get update && apt-get install -y \

curl \

sudo \

python3-pip \

python3-venv \

ripgrep \

chromium \

iputils-ping \

bind9-dnsutils \

# X11 libraries required for computer use plugin

libx11-6 \

libxrandr2 \

libxext6 \

libxrender1 \

libxfixes3 \

libxss1 \

libxtst6 \

libxi6 \

# XCB libraries for screen recording

libxcb1 \

libxcb-shm0 \

libxcb-shape0 \

libxcb-xfixes0 \

# FFmpeg for screen recording

ffmpeg \

# VNC and desktop environment for computer use

xvfb \

x11vnc \

novnc \

xfce4 \

xfce4-terminal \

dbus-x11 \

&& rm -rf /var/lib/apt/lists/\*

# Install pipx and uv

RUN python3 -m pip install --no-cache-dir pipx==1.8.0 && pipx ensurepath && pipx install uv==0.9.26

# Install the Python Language Server

RUN python3 -m pip install --no-cache-dir python-lsp-server==1.14.0

# Install common pip packages

RUN python3 -m pip install --no-cache-dir \

numpy==2.4.1 \

pandas==2.3.3 \

scikit-learn==1.8.0 \

keras==3.13.0 \

torch==2.10.0 \

scipy==1.17.0 \

seaborn==0.13.2 \

matplotlib==3.10.8 \

django==6.0.1 \

flask==3.1.2 \

beautifulsoup4==4.14.3 \

requests==2.32.5 \

opencv-python==4.13.0.90 \

pillow==12.1.0 \

sqlalchemy==2.0.46 \

daytona==0.134.0 \

pydantic-ai==1.47.0 \

langchain==1.2.7 \

transformers==4.57.6 \

openai==2.15.0 \

anthropic==0.76.0 \

llama-index==0.14.13 \

instructor==1.14.4 \

huggingface-hub==0.36.0 \

ollama==0.6.1 \

claude-agent-sdk==0.1.22

# Create the Daytona user and configure sudo access

RUN useradd -m daytona && echo "daytona ALL=(ALL) NOPASSWD:ALL" \> /etc/sudoers.d/91-daytona

# Install latest Node.js using nvm

RUN bash -c "source /usr/local/share/nvm/nvm.sh && nvm install 25 && nvm use 25 && nvm alias default 25" \

&& chown -R daytona:daytona /usr/local/share/nvm

RUN npm install -g ts-node@10.9.2 typescript@5.9.3 typescript-language-server@5.1.3 bun@1.3.6 @anthropic-ai/claude-code@2.1.19 openclaw@2026.2.1 opencode-ai@1.1.35

# Create directory for computer use plugin

RUN mkdir -p /usr/local/lib && chown daytona:daytona /usr/local/lib

ENV LANG=en\_US.UTF-8 \

LC\_ALL=en\_US.UTF-8

# Switch to Daytona user

USER daytona

# Create .zshrc to suppress zsh-newuser-install prompt

RUN touch ~/.zshrc

# Keep the container running indefinitely

ENTRYPOINT \[ "sleep", "infinity" \]

You can’t perform that action at this time.


While the code is focused, press Alt+F1 for a menu of operations.