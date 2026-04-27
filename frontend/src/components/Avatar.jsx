export default function Avatar({
  avatarImageUrl,
  avatarEmoji,
  name,
  size = 48,
}) {
  if (typeof avatarImageUrl === "string" && avatarImageUrl.length > 0) {
    return (
      <img
        src={avatarImageUrl}
        alt=""
        width={size}
        height={size}
        className="avatar avatar-img"
        aria-label={name}
      />
    );
  }
  return (
    <span className="avatar" aria-hidden="true">
      {avatarEmoji}
    </span>
  );
}
