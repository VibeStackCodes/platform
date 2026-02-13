JUN 02 2025 // 3 min read

Share

- Copy link
- [Share on Twitter](https://twitter.com/intent/tweet?url=https://www.daytona.io/dotfiles/declarative-image-builder&text=Declarative%20Image%20Builder&via=Daytona)
- [Share on Facebook](https://www.facebook.com/sharer/sharer.php?u=https://www.daytona.io/dotfiles/declarative-image-builder)
- [Share on Linkedin](https://www.linkedin.com/sharing/share-offsite/?url=https://www.daytona.io/dotfiles/declarative-image-builder)

Link copied successfully!

# Declarative Image Builder

[![Ivan Burazin](https://www.datocms-assets.com/103916/1689253760-ivan-full-res-1.jpg?auto=compress%2Cformat&crop=faces&facepad=2.5&fit=facearea&h=256&mask=ellipse&w=256)\\
**Ivan Burazin** CEO & Co-Founder](https://www.daytona.io/dotfiles/author/ivan-burazin)

![Declarative Image Builder](https://www.datocms-assets.com/103916/1748712762-monday-large.png?auto=compress%2Cformat&fit=crop&h=1260&w=2520)![Declarative Image Builder](https://www.datocms-assets.com/103916/1748712778-monday-large-light.png?auto=compress%2Cformat&fit=crop&h=1260&w=2520)

##### \\# Contents

[Just Declare the Image. Daytona Handles the Rest.](https://www.daytona.io/dotfiles/declarative-image-builder#just-declare-the-image-daytona-handles-the-rest) [Works for One-Offs, Too](https://www.daytona.io/dotfiles/declarative-image-builder#works-for-one-offs-too) [The First Real Agent Interface for Image Creation](https://www.daytona.io/dotfiles/declarative-image-builder#the-first-real-agent-interface-for-image-creation)

# Declarative Image Builder

If an agent needs to build a new image, say to create a new default environment, it’s stuck.

Why? Because building a Docker image isn’t just writing a `Dockerfile`. It means downloading the Docker CLI, setting up a build context, running a local build, pushing to a container registry, then telling Daytona where to find it. That’s five steps too many for an agent.

Agents don’t have that kind of muscle. Or patience.

So we removed the complexity.

## Just Declare the Image. Daytona Handles the Rest.

With Daytona’s new **Declarative Image Builder**, agents can now build fully customized Snapshots directly through the SDK. No Docker CLI, no manual uploads, no container registry.

Code copied successfully!

```
1image = (
2    Image.debian_slim("3.12")
3    .pip_install(["numpy", "pandas", "jupyter"])
4    .run_commands(["apt-get update && apt-get install -y git"])
5    .env({"JUPYTER_ENABLE_LAB": "yes"})
6    .workdir("/workspace")
7)
8

9snapshot = daytona.create_image("data-science:latest", image)
```

That’s it. Declare the image. Daytona builds it.

Once built, Snapshots can be launched into Sandboxes instantly, anywhere. It is a zero-human, zero-DevOps interface to environment creation.

## Works for One-Offs, Too

Declarative images aren’t just for reusable templates. You can also build them dynamically during development or testing, perfect for agents handling tasks on the fly.

Code copied successfully!

```
1sandbox = daytona.create(
2    CreateSandboxParams(image=dynamic_image),
3    on_image_build_logs=print
4)
```

This gives agents true autonomy. They can spin up tailored environments on demand, without ever needing to install Docker or touch a registry.

## The First Real Agent Interface for Image Creation

This isn’t a helper function. It is a fundamental shift.

If agents are going to operate independently, they need infra that speaks their language. Not YAML. Not bash. Not “log into AWS and configure ECR.” Just a simple SDK call.

Declarative Image Builder is that interface.

It is live now in the Daytona SDK. And it is one more step toward a world where agents don’t just write code, they ship it.

Tags::

- AI Agents
- Daytona SDK
- Image Builder
- Agentic Workflows
- Agentic

###### About

![Daytona](https://www.datocms-assets.com/103916/1710518847-daytona-logotype-black.png?auto=compress%2Cformat&fit=clip&h=64)![Daytona](https://www.datocms-assets.com/103916/1710518840-daytona-logotype-white.png?auto=compress%2Cformat&fit=clip&h=64)

Secure and Elastic Infrastructure for Running Your AI-Generated Code.

[\[ → Learn more \]](https://daytona.io/)

###### The author

[![Ivan Burazin](https://www.datocms-assets.com/103916/1689253760-ivan-full-res-1.jpg?auto=compress%2Cformat&crop=faces&facepad=2.5&fit=facearea&h=256&mask=ellipse&w=256)\\
**Ivan Burazin** CEO & Co-Founder](https://www.daytona.io/dotfiles/author/ivan-burazin)

Ivan Burazin is the CEO and Co-Founder of Daytona, driven by a mission to streamline the developer experience. His journey in dev tools began with Codeanywhere and continued with the establishment of the Shift developer conference, now a leading global event. After serving as Chief Developer Experience Officer at Infobip, Ivan's vision for Daytona emerged: to simplify development with instantly ready, scalable, and secure environments.

## Related Content

- [![Sandbox Infrastructure for Reinforcement Learning Agents](https://www.datocms-assets.com/103916/1748250251-sandbox-infrastructure-for-reinforcement-learning-agents.png?auto=compress%2Cformat&fit=crop&h=782&w=1564)![Sandbox Infrastructure for Reinforcement Learning Agents](https://www.datocms-assets.com/103916/1748250251-sandbox-infrastructure-for-reinforcement-learning-agents-light.png?auto=compress%2Cformat&fit=crop&h=782&w=1564)\\
**Sandbox Infrastructure for Reinforcement Learning Agents**\\
\\
MAY 23 2025 :: Ivan Burazin](https://www.daytona.io/dotfiles/sandbox-infrastructure-for-reinforcement-learning-agents)
- [![Daytona: Redefining Agent Experience](https://www.datocms-assets.com/103916/1745693347-tuesday-large.png?auto=compress%2Cformat&fit=crop&h=782&w=1564)![Daytona: Redefining Agent Experience](https://www.datocms-assets.com/103916/1745693347-tuesday-large-light.png?auto=compress%2Cformat&fit=crop&h=782&w=1564)\\
**Daytona: Redefining Agent Experience**\\
\\
APR 29 2025 :: Ivan Burazin](https://www.daytona.io/dotfiles/daytona-redefining-agent-experience)

## Newsletter

**Subscribe to DotFiles Insider,** a weekly newsletter for developers covering stories, techniques, guides and
the latest product innovations coming.

Enter your email