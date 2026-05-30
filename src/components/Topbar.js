import "./topbar.css";

export default function Topbar() {
  return (
    <div className="topbar">

      <div className="topbar-marquee">

        <div className="topbar-track">

          <span>Designer Styles</span>
          <span>•</span>

          <span>Live Video Shopping</span>
          <span>•</span>

          <span>5 Days Easy Exchange</span>
          <span>•</span>

          <span>Delivering Elegance Across India</span>
          <span>•</span>

          <span>Luxury Designer Styles</span>
          <span>•</span>

          {/* DUPLICATE FOR SMOOTH LOOP */}

          <span>Designer Styles</span>
          <span>•</span>

          <span>Live Video Shopping</span>
          <span>•</span>

          <span>5 Days Easy Exchange</span>
          <span>•</span>

          <span>Delivering Elegance Across India</span>
          <span>•</span>

          <span>Luxury Designer Styles</span>
          <span>•</span>

        </div>

      </div>

    </div>
  );
}